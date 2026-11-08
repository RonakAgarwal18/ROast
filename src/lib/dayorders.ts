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

export async function settleDayOrders(
  dateIso: string
): Promise<{ filled: number; closed: number }> {
  const date = dayDate(dateIso);
  let filled = 0;
  let closed = 0;

  const pending = await prisma.position.findMany({
    where: { entryMode: "NEXT_OPEN", status: "OPEN" },
  });
  for (const pos of pending) {
    if (!pos.plannedAmount) continue;
    const sc = await prisma.stockClose.findUnique({
      where: { stockId_date: { stockId: pos.stockId, date } },
    });
    if (!sc || sc.open == null || sc.open <= 0) continue;
    await prisma.position.update({
      where: { id: pos.id },
      data: {
        entryPrice: sc.open,
        units: pos.plannedAmount / sc.open,
        entryDate: date,
        entryMode: "CLOSE",
      },
    });
    filled++;
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
