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
    const invested = open.reduce((s, x) => s + x.units * x.entryPrice, 0);
    const marketValue = open.reduce((s, x) => s + x.units * x.stock.lastClose, 0);
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
