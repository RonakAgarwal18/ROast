// Daily Movers maths, shared by the /movers page and the nightly run
// (which stores news context for the top movers).

import { prisma } from "./db";
import { dayDate } from "./prices";
import { fetchCompanyHeadlines } from "./headlines";

export type MoverRow = {
  symbol: string;
  name: string;
  close: number;
  prev: number;
  change: number;
};

export const MOVER_MIN_PRICE = 5; // skip penny noise

export async function computeMovers(
  dateIso: string,
  topN = 15
): Promise<{ gainers: MoverRow[]; losers: MoverRow[]; prevIso: string | null }> {
  const date = dayDate(dateIso);
  const prevRow = await prisma.stockClose.findFirst({
    where: { date: { lt: date } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!prevRow) return { gainers: [], losers: [], prevIso: null };
  const rows = await prisma.stockClose.findMany({
    where: { date: { in: [date, prevRow.date] } },
    include: { stock: { select: { symbol: true, name: true } } },
  });
  const byStock = new Map<number, { symbol: string; name: string; cur?: number; prev?: number }>();
  for (const r of rows) {
    const e = byStock.get(r.stockId) ?? { symbol: r.stock.symbol, name: r.stock.name };
    if (r.date.getTime() === date.getTime()) e.cur = r.close;
    else e.prev = r.close;
    byStock.set(r.stockId, e);
  }
  const all: MoverRow[] = [];
  for (const e of byStock.values()) {
    if (e.cur === undefined || e.prev === undefined || e.prev <= 0 || e.cur < MOVER_MIN_PRICE) continue;
    all.push({
      symbol: e.symbol,
      name: e.name,
      close: e.cur,
      prev: e.prev,
      change: ((e.cur - e.prev) / e.prev) * 100,
    });
  }
  const p = (n: number) => String(n).padStart(2, "0");
  const prev = prevRow.date;
  return {
    gainers: [...all].sort((a, b) => b.change - a.change).slice(0, topN),
    losers: [...all].sort((a, b) => a.change - b.change).slice(0, topN),
    prevIso: `${prev.getFullYear()}-${p(prev.getMonth() + 1)}-${p(prev.getDate())}`,
  };
}

/**
 * For the day's top movers, fetch the news that ran around the move and
 * store it as possible context. Runs inside the nightly price run;
 * best-effort per stock, capped, and idempotent (unique date+symbol+title).
 */
export async function recordMoverHeadlines(dateIso: string): Promise<number> {
  const { gainers, losers } = await computeMovers(dateIso, 10);
  const movers = [...gainers, ...losers];
  if (movers.length === 0) return 0;
  const day = dayDate(dateIso);
  const from = new Date(day);
  from.setDate(from.getDate() - 4);
  const to = new Date(day);
  to.setDate(to.getDate() + 2);
  let stored = 0;
  for (const m of movers) {
    try {
      const headlines = await fetchCompanyHeadlines(m.name, from, to, 3);
      if (headlines.length === 0) continue;
      await prisma.moverHeadline.createMany({
        data: headlines.map((h) => ({
          date: day,
          symbol: m.symbol,
          title: h.title,
          url: h.url,
          source: h.source,
          publishedAt: h.publishedAt,
        })),
        skipDuplicates: true,
      });
      stored++;
    } catch {
      // One bad feed must not stop the rest.
    }
  }
  return stored;
}
