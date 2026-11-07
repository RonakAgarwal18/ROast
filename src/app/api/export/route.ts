import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOwnerSession } from "@/lib/auth";

// Owner-only data export (Round 5): the whole league as one JSON dump,
// or a single table as CSV. Linked from /admin. The session cookie rides
// along on the link, so a logged-in owner just clicks and downloads.

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function GET(request: Request) {
  if (!(await getOwnerSession())) {
    return NextResponse.json({ error: "owner login required" }, { status: 401 });
  }
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const type = url.searchParams.get("type") ?? "positions";

  if (format === "csv") {
    let rows: Record<string, unknown>[] = [];
    if (type === "positions") {
      rows = (await prisma.position.findMany({
        include: {
          stock: { select: { symbol: true } },
          portfolio: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      })).map((p) => ({
        id: p.id,
        portfolio: p.portfolio.name,
        symbol: p.stock.symbol,
        units: p.units,
        entryPrice: p.entryPrice,
        entryDate: p.entryDate,
        targetPrice: p.targetPrice,
        exitPrice: p.exitPrice,
        status: p.status,
        tag: p.tag,
        sellPrice: p.sellPrice,
        sellDate: p.sellDate,
      }));
    } else if (type === "claims") {
      rows = (await prisma.claim.findMany({
        include: {
          stock: { select: { symbol: true } },
          source: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      })).map((c) => ({
        id: c.id,
        source: c.source.name,
        symbol: c.stock.symbol,
        claim: c.claimText,
        quote: c.quoteSentence,
        dueDate: c.dueDate,
        verdict: c.verdict,
        createdAt: c.createdAt,
      }));
    } else if (type === "snapshots") {
      rows = (await prisma.portfolioSnapshot.findMany({
        include: { portfolio: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { portfolioId: "asc" }],
      })).map((s) => ({
        date: s.date,
        portfolio: s.portfolio.name,
        totalValue: s.totalValue,
        returnPct: s.returnPct,
        niftyClose: s.niftyClose,
      }));
    } else {
      return NextResponse.json({ error: "unknown csv type" }, { status: 400 });
    }
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roast-${type}-${stamp()}.csv"`,
      },
    });
  }

  const dump = {
    exportedAt: new Date().toISOString(),
    sources: await prisma.source.findMany({ orderBy: { id: "asc" } }),
    portfolios: await prisma.portfolio.findMany({ orderBy: { id: "asc" } }),
    positions: await prisma.position.findMany({ orderBy: { id: "asc" } }),
    orders: await prisma.order.findMany({ orderBy: { id: "asc" } }),
    claims: await prisma.claim.findMany({ orderBy: { id: "asc" } }),
    claimItems: await prisma.claimItem.findMany({ orderBy: { id: "asc" } }),
    snapshots: await prisma.portfolioSnapshot.findMany({ orderBy: { id: "asc" } }),
    events: await prisma.catalystEvent.findMany({ orderBy: { id: "asc" } }),
    sourceTexts: await prisma.sourceText.findMany({ orderBy: { id: "asc" } }),
    dayNotes: await prisma.dayNote.findMany({ orderBy: { id: "asc" } }),
    rules: await prisma.rule.findMany({ orderBy: { id: "asc" } }),
    priceRuns: await prisma.priceRun.findMany({ orderBy: { id: "asc" } }),
    stocks: await prisma.stock.findMany({ orderBy: { id: "asc" } }),
  };
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="roast-export-${stamp()}.json"`,
    },
  });
}
