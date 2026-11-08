// World board data (Round 8) — global indices, metals, oil, FX and
// crypto from Yahoo Finance's public chart API (no key; Stooq is
// JS-challenge-blocked). World instruments are Stocks with exchange =
// "WORLD"; their daily closes live in StockClose like everything else,
// so each gets a full chart page for free. Indian indices ride the NSE
// index file in prices.ts (exchange = "INDEX").

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dayDate } from "./prices";

export type WorldDef = {
  symbol: string; // our DB symbol (URL-safe)
  yahoo: string;
  name: string;
  group: "GLOBAL" | "METALS" | "ENERGY_FX";
  unit: string; // display suffix, e.g. "USD/oz"
};

export const WORLD_DEFS: WorldDef[] = [
  { symbol: "SP500", yahoo: "^GSPC", name: "S&P 500 · US", group: "GLOBAL", unit: "" },
  { symbol: "DOW", yahoo: "^DJI", name: "Dow Jones · US", group: "GLOBAL", unit: "" },
  { symbol: "NASDAQ", yahoo: "^IXIC", name: "Nasdaq Composite · US", group: "GLOBAL", unit: "" },
  { symbol: "FTSE100", yahoo: "^FTSE", name: "FTSE 100 · UK", group: "GLOBAL", unit: "" },
  { symbol: "DAX", yahoo: "^GDAXI", name: "DAX · Germany", group: "GLOBAL", unit: "" },
  { symbol: "NIKKEI225", yahoo: "^N225", name: "Nikkei 225 · Japan", group: "GLOBAL", unit: "" },
  { symbol: "HANGSENG", yahoo: "^HSI", name: "Hang Seng · Hong Kong", group: "GLOBAL", unit: "" },
  { symbol: "SSECOMP", yahoo: "000001.SS", name: "SSE Composite · China", group: "GLOBAL", unit: "" },
  { symbol: "GOLD", yahoo: "GC=F", name: "Gold", group: "METALS", unit: "USD/oz" },
  { symbol: "SILVER", yahoo: "SI=F", name: "Silver", group: "METALS", unit: "USD/oz" },
  { symbol: "CRUDE", yahoo: "CL=F", name: "Crude Oil (WTI)", group: "ENERGY_FX", unit: "USD/bbl" },
  { symbol: "USDINR", yahoo: "USDINR=X", name: "USD / INR", group: "ENERGY_FX", unit: "₹" },
  { symbol: "BTC", yahoo: "BTC-USD", name: "Bitcoin", group: "ENERGY_FX", unit: "USD" },
];

export const INDIA_INDEX_DEFS = [
  { symbol: "NIFTY", name: "Nifty 50" },
  { symbol: "NIFTYNEXT50", name: "Nifty Next 50" },
  { symbol: "NIFTYBANK", name: "Nifty Bank" },
  { symbol: "NIFTYIT", name: "Nifty IT" },
  { symbol: "INDIAVIX", name: "India VIX" },
];

export type DayBar = { dateIso: string; close: number };

/** Daily closes for one Yahoo symbol (oldest → newest), nulls dropped. */
export async function fetchYahooDaily(yahooSymbol: string, range = "6mo"): Promise<DayBar[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?range=${range}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const offset = Number(result.meta?.gmtoffset ?? 0);
    const stamps: number[] = result.timestamp ?? [];
    const closes: Array<number | null> = result.indicators?.quote?.[0]?.close ?? [];
    const out: DayBar[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const close = closes[i];
      if (close == null || isNaN(close)) continue;
      const d = new Date((stamps[i] + offset) * 1000);
      const p = (n: number) => String(n).padStart(2, "0");
      out.push({
        dateIso: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
        close,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Refresh every WORLD stock from Yahoo: upsert the returned daily bars
 * into StockClose and point lastClose/prevClose/closeDate at the last
 * two bars. Pulling a 6-month window nightly makes the series
 * self-healing — a missed night backfills itself.
 */
export async function applyWorldQuotes(): Promise<{ updated: number; failed: string[] }> {
  const stocks = await prisma.stock.findMany({
    where: { exchange: "WORLD" },
    select: { id: true, symbol: true },
  });
  const bySymbol = new Map(stocks.map((s) => [s.symbol, s.id]));
  let updated = 0;
  const failed: string[] = [];
  for (const def of WORLD_DEFS) {
    const id = bySymbol.get(def.symbol);
    if (id === undefined) continue;
    const bars = await fetchYahooDaily(def.yahoo, "6mo");
    if (bars.length < 2) {
      failed.push(def.symbol);
      continue;
    }
    const CHUNK = 400;
    for (let i = 0; i < bars.length; i += CHUNK) {
      const slice = bars.slice(i, i + CHUNK);
      const values = Prisma.join(
        slice.map((b) => Prisma.sql`(${id}::int, ${dayDate(b.dateIso)}::timestamp, ${b.close}::float8)`)
      );
      await prisma.$executeRaw`
        INSERT INTO "StockClose" ("stockId", "date", "close")
        SELECT * FROM (VALUES ${values}) AS v(sid, dt, c)
        ON CONFLICT ("stockId", "date") DO UPDATE SET "close" = EXCLUDED."close"`;
    }
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    await prisma.stock.update({
      where: { id },
      data: {
        lastClose: last.close,
        prevClose: prev.close,
        closeDate: dayDate(last.dateIso),
      },
    });
    updated++;
  }
  return { updated, failed };
}
