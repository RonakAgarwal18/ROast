// Round 6 backfill: seed StockClose history from past bhavcopy files.
//
// Runs from this VM, so it talks to Neon over the HTTP driver (raw TCP
// and the Prisma adapter's WebSocket are both broken here — see
// scripts/load-neon.ts). Parsing reuses the app's own parseBhavcopyCsv;
// only the writes are hand-rolled SQL. Stock.lastClose is NOT touched —
// history rows only.
//
//   npx tsx scripts/backfill-history.ts [daysBack=50] [endIso=2026-11-06]

import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const direct = (process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer");
if (!direct) throw new Error("DIRECT_URL missing");
const sql = neon(direct);

const pad = (n: number) => String(n).padStart(2, "0");
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
const yyyymmdd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function main() {
  const { parseBhavcopyCsv } = await import("../src/lib/prices");
  const daysBack = parseInt(process.argv[2] ?? "50", 10);
  const end = process.argv[3] ? new Date(`${process.argv[3]}T12:00:00`) : new Date();

  const stocks = await sql`SELECT "id", "symbol", "name" FROM "Stock"`;
  const bySymbol = new Map<string, number>(stocks.map((s: any) => [s.symbol, s.id]));
  const norm = (name: string) =>
    name.toUpperCase().replace(/\b(LIMITED|LTD|LIMITE|THE|AND|&)\b/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const byName = new Map<string, number>();
  for (const s of stocks as any[]) {
    const k = norm(s.name);
    if (!byName.has(k)) byName.set(k, s.id);
  }

  let totalRows = 0;
  let daysDone = 0;
  for (let back = 0; back <= daysBack; back++) {
    const day = new Date(end);
    day.setDate(day.getDate() - back);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    const dayIso = iso(day);
    const writes = new Map<number, number>();

    const bse = await fetchText(`https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyymmdd(day)}_F_0000.csv`);
    if (bse) {
      const p = parseBhavcopyCsv(bse);
      for (const r of p.prices) {
        const id = bySymbol.get(r.symbol);
        if (id !== undefined) writes.set(id, r.close);
      }
      for (const r of p.byName) {
        const id = byName.get(norm(r.name));
        if (id !== undefined && !writes.has(id)) writes.set(id, r.close);
      }
    }
    const nse = await fetchText(`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(day)}.csv`);
    if (nse) {
      const p = parseBhavcopyCsv(nse);
      for (const r of p.prices) {
        const id = bySymbol.get(r.symbol);
        if (id !== undefined) writes.set(id, r.close);
      }
    }
    const idx = await fetchText(`https://nsearchives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy(day)}.csv`);
    if (idx) {
      const p = parseBhavcopyCsv(idx);
      for (const r of p.index) {
        const id = bySymbol.get(r.symbol);
        if (id !== undefined) writes.set(id, r.close);
      }
    }

    if (writes.size === 0) {
      console.log(`${dayIso}: no files (holiday?) — skipped`);
      continue;
    }
    const rows = [...writes.entries()];
    const stamp = `${dayIso}T00:00:00.000Z`;
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const params: unknown[] = [];
      const tuples = slice.map(([id, close], j) => {
        params.push(id, stamp, close);
        return `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`;
      });
      await sql.query(
        `INSERT INTO "StockClose" ("stockId", "date", "close") VALUES ${tuples.join(",")}
         ON CONFLICT ("stockId", "date") DO UPDATE SET "close" = EXCLUDED."close"`,
        params
      );
    }
    totalRows += rows.length;
    daysDone++;
    console.log(`${dayIso}: ${rows.length} closes`);
  }
  const count = await sql`SELECT COUNT(*)::int AS n, MIN("date") AS from_d, MAX("date") AS to_d FROM "StockClose"`;
  console.log(`DONE: ${daysDone} trading days, ${totalRows} rows written. Table now:`, count[0]);
}

main().catch((e) => { console.error(e); process.exit(1); });
