// Seed Round 8: extra NSE index stocks (history from the same index
// files the cron reads) + WORLD stocks (Yahoo 1y daily bars).
//   npx tsx scripts/seed-world.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const direct = (process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer");
  const sql = neon(direct);
  const { parseBhavcopyCsv } = await import("../src/lib/prices");
  const { WORLD_DEFS, INDIA_INDEX_DEFS, fetchYahooDaily } = await import("../src/lib/world");

  async function upsertStock(symbol: string, name: string, exchange: string): Promise<number> {
    const r = await sql`
      INSERT INTO "Stock" ("symbol", "name", "exchange") VALUES (${symbol}, ${name}, ${exchange})
      ON CONFLICT ("symbol") DO UPDATE SET "name" = EXCLUDED."name" RETURNING "id"`;
    return r[0].id;
  }
  async function insertCloses(stockId: number, bars: Array<{ dateIso: string; close: number }>) {
    for (let i = 0; i < bars.length; i += 400) {
      const slice = bars.slice(i, i + 400);
      const params: unknown[] = [];
      const tuples = slice.map((b, j) => {
        params.push(stockId, `${b.dateIso}T00:00:00.000Z`, b.close);
        const base = j * 3;
        return `($${base + 1},$${base + 2},$${base + 3})`;
      });
      await sql.query(
        `INSERT INTO "StockClose" ("stockId","date","close") VALUES ${tuples.join(",")}
         ON CONFLICT ("stockId","date") DO UPDATE SET "close" = EXCLUDED."close"`,
        params
      );
    }
  }
  async function setLast(stockId: number, last: { dateIso: string; close: number }, prev: { close: number } | null) {
    await sql`
      UPDATE "Stock" SET "lastClose" = ${last.close}, "prevClose" = ${prev?.close ?? null},
        "closeDate" = ${`${last.dateIso}T00:00:00.000Z`} WHERE "id" = ${stockId}`;
  }

  // --- Indian indices: walk back over the index files ---
  const indexIds = new Map<string, number>();
  for (const d of INDIA_INDEX_DEFS) {
    if (d.symbol === "NIFTY") {
      const r = await sql`SELECT "id" FROM "Stock" WHERE "symbol" = 'NIFTY'`;
      indexIds.set("NIFTY", r[0].id);
    } else {
      indexIds.set(d.symbol, await upsertStock(d.symbol, d.name, "INDEX"));
    }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const bySymbolBars = new Map<string, Array<{ dateIso: string; close: number }>>();
  const end = new Date("2026-11-06T12:00:00");
  for (let back = 0; back <= 50; back++) {
    const day = new Date(end);
    day.setDate(day.getDate() - back);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const url = `https://nsearchives.nseindia.com/content/indices/ind_close_all_${pad(day.getDate())}${pad(day.getMonth() + 1)}${day.getFullYear()}.csv`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const parsed = parseBhavcopyCsv(await res.text());
      if (parsed.kind !== "INDEX" || !parsed.fileDate) continue;
      for (const row of parsed.index) {
        const arr = bySymbolBars.get(row.symbol) ?? [];
        arr.push({ dateIso: parsed.fileDate, close: row.close });
        bySymbolBars.set(row.symbol, arr);
      }
    } catch { /* holiday / unreachable */ }
  }
  for (const [symbol, bars] of bySymbolBars) {
    const id = indexIds.get(symbol);
    if (id === undefined || bars.length === 0) continue;
    bars.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    await insertCloses(id, bars);
    await setLast(id, bars[bars.length - 1], bars[bars.length - 2] ?? null);
    console.log(`INDEX ${symbol}: ${bars.length} days, last ${bars[bars.length - 1].close} @ ${bars[bars.length - 1].dateIso}`);
  }

  // --- World instruments from Yahoo (1y) ---
  for (const def of WORLD_DEFS) {
    const id = await upsertStock(def.symbol, def.name, "WORLD");
    const bars = await fetchYahooDaily(def.yahoo, "1y");
    if (bars.length < 2) {
      console.log(`WORLD ${def.symbol}: FAILED (${bars.length} bars)`);
      continue;
    }
    await insertCloses(id, bars);
    await setLast(id, bars[bars.length - 1], bars[bars.length - 2]);
    console.log(`WORLD ${def.symbol}: ${bars.length} days, last ${bars[bars.length - 1].close.toFixed(2)} @ ${bars[bars.length - 1].dateIso}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
