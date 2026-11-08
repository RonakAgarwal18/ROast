// Mutual funds (Round 7) — AMFI's daily NAV file is the one source.
//
// Design: a fund scheme is just a master row (FundScheme). When a scheme
// joins the league it becomes a Stock with exchange = "MF" and symbol =
// "MF<schemeCode>", and its NAV history lives in StockClose — so the
// league table, snapshots, compare view and stock charts all work on
// benchmarks with zero special-casing. Funds are yardsticks, never
// recommendations.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dayDate, writeSnapshots } from "./prices";

export const NAVALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export type FundRow = {
  schemeCode: string;
  isin: string | null;
  name: string;
  plan: string;
  option: string;
  amc: string;
  category: string;
  nav: number | null;
  dateIso: string | null; // yyyy-mm-dd
};

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function navDateToIso(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[2].toUpperCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`;
}

/** Parse AMFI's NAVAll.txt (semicolon rows under category/AMC headers). */
export function parseNavAll(text: string): FundRow[] {
  const out: FundRow[] = [];
  let category = "";
  let amc = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes(";")) {
      if (/schemes/i.test(line)) category = line;
      else amc = line;
      continue;
    }
    const f = line.split(";").map((x) => x.trim());
    if (f.length < 8 || !/^\d+$/.test(f[0])) continue;
    const nav = parseFloat((f[6] ?? "").replace(/,/g, ""));
    out.push({
      schemeCode: f[0],
      isin: f[1] && f[1] !== "-" ? f[1] : f[2] && f[2] !== "-" ? f[2] : null,
      name: f[3],
      plan: f[4],
      option: f[5],
      amc,
      category,
      nav: isNaN(nav) ? null : nav,
      dateIso: navDateToIso(f[7] ?? ""),
    });
  }
  return out;
}

/** "Axis Children's Fund · Direct Growth" — the name a human would say. */
export function fundDisplayName(s: {
  name: string;
  plan: string;
  option: string;
}): string {
  const plan = s.plan.replace(/ Plan$/, "");
  const opt = s.option.replace(/ Option$/, "");
  return `${s.name} · ${plan} ${opt}`;
}

export function fundSymbol(schemeCode: string): string {
  return `MF${schemeCode}`;
}

/** Bulk-upsert the FundScheme master from parsed NAV rows. */
export async function refreshFundMaster(rows: FundRow[]): Promise<number> {
  const CHUNK = 400;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = Prisma.join(
      slice.map(
        (r) =>
          Prisma.sql`(${r.schemeCode}, ${r.isin}, ${r.name}, ${r.plan}, ${r.option}, ${r.amc}, ${r.category}, ${r.nav}::float8, ${
            r.dateIso ? dayDate(r.dateIso) : null
          }::timestamp)`
      )
    );
    // 9 values per tuple for the 9 listed columns; "updatedAt" is left
    // to its DB default on insert and bumped explicitly on conflict.
    await prisma.$executeRaw`
      INSERT INTO "FundScheme" ("schemeCode", "isin", "name", "plan", "option", "amc", "category", "nav", "navDate")
      SELECT * FROM (VALUES ${values}) AS v(code, isin, nm, pl, op, amc, cat, nav, nd)
      ON CONFLICT ("schemeCode") DO UPDATE SET
        "isin" = EXCLUDED."isin", "name" = EXCLUDED."name", "plan" = EXCLUDED."plan",
        "option" = EXCLUDED."option", "amc" = EXCLUDED."amc", "category" = EXCLUDED."category",
        "nav" = EXCLUDED."nav", "navDate" = EXCLUDED."navDate", "updatedAt" = NOW()`;
    done += slice.length;
  }
  return done;
}

/**
 * Apply fresh NAVs to the MF stocks that are in the league: update
 * lastClose/prevClose/closeDate, record StockClose rows, then freeze
 * portfolio snapshots for the NAV date.
 */
export async function applyFundNavs(
  rows: FundRow[]
): Promise<{ updated: number; navDate: string | null; snapshots: number }> {
  const mfStocks = await prisma.stock.findMany({
    where: { exchange: "MF" },
    select: { id: true, symbol: true, lastClose: true, prevClose: true, closeDate: true },
  });
  if (mfStocks.length === 0) return { updated: 0, navDate: null, snapshots: 0 };
  const byCode = new Map(rows.map((r) => [r.schemeCode, r]));
  type W = { id: number; nav: number; prev: number | null; dateIso: string };
  const writes: W[] = [];
  for (const s of mfStocks) {
    const row = byCode.get(s.symbol.replace(/^MF/, ""));
    if (!row || row.nav === null || !row.dateIso) continue;
    const navDay = dayDate(row.dateIso).getTime();
    const prev =
      s.closeDate && s.closeDate.getTime() !== navDay ? s.lastClose : s.prevClose;
    writes.push({ id: s.id, nav: row.nav, prev, dateIso: row.dateIso });
  }
  if (writes.length === 0) return { updated: 0, navDate: null, snapshots: 0 };

  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const slice = writes.slice(i, i + CHUNK);
    const values = Prisma.join(
      slice.map((w) => Prisma.sql`(${w.id}::int, ${w.nav}::float8, ${w.prev}::float8)`)
    );
    await prisma.$executeRaw`
      UPDATE "Stock" AS s
      SET "lastClose" = v.nav, "prevClose" = v.prev
      FROM (VALUES ${values}) AS v(id, nav, prev)
      WHERE s.id = v.id`;
    const byDate = new Map<string, typeof slice>();
    for (const w of slice) {
      const arr = byDate.get(w.dateIso) ?? [];
      arr.push(w);
      byDate.set(w.dateIso, arr);
    }
    for (const [dateIso, arr] of byDate) {
      const d = dayDate(dateIso);
      const vals = Prisma.join(
        arr.map((w) => Prisma.sql`(${w.id}::int, ${d}::timestamp, ${w.nav}::float8)`)
      );
      await prisma.$executeRaw`
        INSERT INTO "StockClose" ("stockId", "date", "close")
        SELECT * FROM (VALUES ${vals}) AS v(id, dt, c)
        ON CONFLICT ("stockId", "date") DO UPDATE SET "close" = EXCLUDED."close"`;
      await prisma.stock.updateMany({
        where: { id: { in: arr.map((w) => w.id) } },
        data: { closeDate: d },
      });
    }
  }
  const navDate = writes.map((w) => w.dateIso).sort().slice(-1)[0] ?? null;
  const snapshots = navDate ? await writeSnapshots(navDate) : 0;
  return { updated: writes.length, navDate, snapshots };
}

/**
 * Backfill a league fund's NAV history from mfapi.in (free mirror of
 * AMFI data) into StockClose — capped at the most recent ~400 NAV days.
 */
export async function backfillFundHistory(
  stockId: number,
  schemeCode: string
): Promise<number> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as {
      data?: Array<{ date: string; nav: string }>;
    };
    const rows = (json.data ?? []).slice(0, 400);
    const parsed: Array<{ d: Date; nav: number }> = [];
    for (const r of rows) {
      const m = r.date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const nav = parseFloat(r.nav);
      if (!m || isNaN(nav)) continue;
      parsed.push({ d: new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`), nav });
    }
    const CHUNK = 400;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const slice = parsed.slice(i, i + CHUNK);
      const values = Prisma.join(
        slice.map((r) => Prisma.sql`(${stockId}::int, ${r.d}::timestamp, ${r.nav}::float8)`)
      );
      await prisma.$executeRaw`
        INSERT INTO "StockClose" ("stockId", "date", "close")
        SELECT * FROM (VALUES ${values}) AS v(id, dt, c)
        ON CONFLICT ("stockId", "date") DO UPDATE SET "close" = EXCLUDED."close"`;
    }
    return parsed.length;
  } catch {
    return 0;
  }
}
