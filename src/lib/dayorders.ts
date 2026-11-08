// Day orders — the one-day contest format. A position can be booked
// before the session it belongs to:
//   entryMode = NEXT_OPEN  → fills at that session's opening price
//                            (units = plannedAmount / open)
//   exitMode  = DAY_CLOSE  → auto-sells at that session's close,
//                            proceeds return to the portfolio's cash
// The nightly run settles both after the day's bhavcopy lands (the
// exchange file carries the open as well as the close), then re-freezes
// the day's snapshots so the league shows the settled state.

import { prisma } from "./db";
import { dayDate, writeSnapshots } from "./prices";
import { nearestShares } from "./shares";

export async function settleDayOrders(
  dateIso: string
): Promise<{ filled: number; closed: number }> {
  const date = dayDate(dateIso);
  let filled = 0;
  let closed = 0;

  const pending = await prisma.position.findMany({
    where: { entryMode: "NEXT_OPEN", status: "OPEN" },
  });
  // Whole shares, sized by nearestShares: the count whose total is
  // closest to the allocation (one share over when that is closer and
  // within the 20% overshoot leash). A book-level guard then flips the
  // largest round-ups back to their floors if the book's total would
  // exceed the cash it actually has. The signed remainder of each
  // allocation (negative when rounded up) settles into the book's cash.
  const byPortfolio = new Map<number, typeof pending>();
  for (const pos of pending) {
    const arr = byPortfolio.get(pos.portfolioId) ?? [];
    arr.push(pos);
    byPortfolio.set(pos.portfolioId, arr);
  }
  for (const [portfolioId, positions] of byPortfolio) {
    const pf = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { cash: true },
    });
    if (!pf) continue;
    type Fill = {
      pos: (typeof positions)[number];
      open: number;
      units: number;
      floorUnits: number;
    };
    const fills: Fill[] = [];
    for (const pos of positions) {
      if (!pos.plannedAmount) continue;
      const sc = await prisma.stockClose.findUnique({
        where: { stockId_date: { stockId: pos.stockId, date } },
      });
      if (!sc || sc.open == null || sc.open <= 0) continue;
      fills.push({
        pos,
        open: sc.open,
        units: nearestShares(pos.plannedAmount, sc.open),
        floorUnits: Math.floor(pos.plannedAmount / sc.open),
      });
    }
    if (fills.length === 0) continue;
    let total = fills.reduce((s2, f) => s2 + f.units * f.open, 0);
    const budget =
      pf.cash + fills.reduce((s2, f) => s2 + (f.pos.plannedAmount ?? 0), 0);
    const roundedUp = fills
      .filter((f) => f.units > f.floorUnits)
      .sort(
        (a, b) =>
          b.units * b.open -
          (b.pos.plannedAmount ?? 0) -
          (a.units * a.open - (a.pos.plannedAmount ?? 0))
      );
    for (const f of roundedUp) {
      if (total <= budget) break;
      total -= f.open;
      f.units = f.floorUnits;
    }
    let remainderSum = 0;
    for (const f of fills) {
      await prisma.position.update({
        where: { id: f.pos.id },
        data: {
          entryPrice: f.open,
          units: f.units,
          entryDate: date,
          entryMode: "CLOSE",
        },
      });
      filled++;
      remainderSum += (f.pos.plannedAmount ?? 0) - f.units * f.open;
    }
    if (remainderSum !== 0) {
      await prisma.portfolio.update({
        where: { id: portfolioId },
        data: { cash: pf.cash + remainderSum },
      });
    }
  }

  const toClose = await prisma.position.findMany({
    where: {
      exitMode: "DAY_CLOSE",
      status: "OPEN",
      entryMode: "CLOSE",
      entryDate: { lte: date },
    },
  });
  const proceeds = new Map<number, number>();
  for (const pos of toClose) {
    const sc = await prisma.stockClose.findUnique({
      where: { stockId_date: { stockId: pos.stockId, date } },
    });
    if (!sc) continue;
    await prisma.position.update({
      where: { id: pos.id },
      data: { status: "CLOSED", sellPrice: sc.close, sellDate: date },
    });
    proceeds.set(pos.portfolioId, (proceeds.get(pos.portfolioId) ?? 0) + pos.units * sc.close);
    closed++;
  }
  for (const [portfolioId, amount] of proceeds) {
    const pf = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { cash: true },
    });
    if (pf) {
      await prisma.portfolio.update({
        where: { id: portfolioId },
        data: { cash: pf.cash + amount },
      });
    }
  }

  if (filled > 0 || closed > 0) await writeSnapshots(dateIso);
  return { filled, closed };
}
