import { prisma } from "./db";

// Portfolio maths live here so /league, /portfolios and /records agree.

export type PortfolioRow = {
  id: number;
  name: string;
  isReal: boolean;
  ownerName: string;
  ownerKind: string;
  startingCash: number;
  cash: number;
  invested: number; // cost of open positions (or all positions for real desk)
  marketValue: number; // open positions at last close (+ realised for closed)
  totalValue: number; // cash + open market value (paper) — the league number
  returnPct: number;
  wellDone: number;
  claimsTotal: number;
};

export async function portfolioRows(): Promise<PortfolioRow[]> {
  const portfolios = await prisma.portfolio.findMany({
    include: {
      owner: true,
      positions: { include: { stock: true } },
      claims: true,
    },
    orderBy: { id: "asc" },
  });

  return portfolios.map((p) => {
    const open = p.positions.filter((x) => x.status === "OPEN");
    const invested = open.reduce(
      (s, x) =>
        s + (x.entryMode === "NEXT_OPEN" && x.plannedAmount ? x.plannedAmount : x.units * x.entryPrice),
      0
    );
    // An unfilled NEXT_OPEN order is committed cash, not an investment:
    // it contributes its planned amount (return 0%) until the nightly
    // run fills it at the open and flips it to a normal position.
    const marketValue = open.reduce(
      (s, x) =>
        s +
        (x.entryMode === "NEXT_OPEN" && x.plannedAmount
          ? x.plannedAmount
          : x.units * (x.stock.lastClose ?? 0)),
      0
    );
    const totalValue = p.isReal ? marketValue : p.cash + marketValue;
    const base = p.isReal ? invested : p.startingCash;
    const returnPct = base > 0 ? ((totalValue - base) / base) * 100 : 0;
    return {
      id: p.id,
      name: p.name,
      isReal: p.isReal,
      ownerName: p.owner.name,
      ownerKind: p.owner.kind,
      startingCash: p.startingCash,
      cash: p.cash,
      invested,
      marketValue,
      totalValue,
      returnPct,
      wellDone: p.claims.filter((c) => c.verdict === "WELL_DONE").length,
      claimsTotal: p.claims.length,
    };
  });
}

/** Rows ranked best → worst by return % (the league table order). */
export async function leagueRows(): Promise<PortfolioRow[]> {
  const rows = await portfolioRows();
  return rows.sort((a, b) => b.returnPct - a.returnPct);
}

export type SnapshotPoint = {
  date: Date;
  totalValue: number;
  returnPct: number;
  niftyClose: number | null;
};

/** Daily snapshots for one portfolio, oldest → newest (equity curve data). */
export async function portfolioSnapshots(portfolioId: number): Promise<SnapshotPoint[]> {
  const rows = await prisma.portfolioSnapshot.findMany({
    where: { portfolioId },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    date: r.date,
    totalValue: r.totalValue,
    returnPct: r.returnPct,
    niftyClose: r.niftyClose,
  }));
}

/** Snapshots for every portfolio at once: portfolioId → points. */
export async function allSnapshots(): Promise<Map<number, SnapshotPoint[]>> {
  const rows = await prisma.portfolioSnapshot.findMany({ orderBy: { date: "asc" } });
  const map = new Map<number, SnapshotPoint[]>();
  for (const r of rows) {
    const list = map.get(r.portfolioId) ?? [];
    list.push({
      date: r.date,
      totalValue: r.totalValue,
      returnPct: r.returnPct,
      niftyClose: r.niftyClose,
    });
    map.set(r.portfolioId, list);
  }
  return map;
}
