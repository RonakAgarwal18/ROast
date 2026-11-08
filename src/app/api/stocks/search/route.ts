// Stock search for pickers: ranked matches over the whole master
// (5,000+ names) — exact symbol first, then symbol prefix, name
// prefix, symbol contains, name contains; listed equities before
// funds/indices/world rows on ties.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json([]);
  const rows = await prisma.stock.findMany({
    where: {
      OR: [
        { symbol: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, symbol: true, name: true, exchange: true, lastClose: true },
    take: 60,
  });
  const ql = q.toLowerCase();
  const rank = (s: (typeof rows)[number]) => {
    const sym = s.symbol.toLowerCase();
    const name = s.name.toLowerCase();
    let r = 4;
    if (sym === ql) r = 0;
    else if (sym.startsWith(ql)) r = 1;
    else if (name.startsWith(ql)) r = 2;
    else if (sym.includes(ql)) r = 3;
    const equity = s.exchange === "NSE" || s.exchange === "BSE" ? 0 : 1;
    return r * 10 + equity;
  };
  const out = rows
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((s) => ({
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      lastClose: s.lastClose,
    }));
  return NextResponse.json(out);
}
