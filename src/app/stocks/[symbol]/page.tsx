import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { price, priceOpt, pct, fmtDate, fmtDayShort, unitsFmt } from "@/lib/format";
import { PageTitle, VerdictStamp } from "@/components/ui";
import { PriceChart, type EntryLine } from "@/components/PriceChart";

export const dynamic = "force-dynamic";

const ENTRY_COLORS = ["#FFB547", "#00D09C", "#E879F9", "#FACC15", "#FF6B5E", "#7DD3FC"];

function windowReturn(closes: { close: number }[], days: number): number | null {
  if (closes.length < 2) return null;
  const slice = closes.slice(-(days + 1));
  const first = slice[0];
  const last = slice[slice.length - 1];
  if (!first || !last || first.close <= 0) return null;
  return ((last.close - first.close) / first.close) * 100;
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const stock = await prisma.stock.findUnique({ where: { symbol } });
  if (!stock) notFound();

  const [closes, positions, claims, events] = await Promise.all([
    prisma.stockClose.findMany({
      where: { stockId: stock.id },
      orderBy: { date: "asc" },
      take: 400,
    }),
    prisma.position.findMany({
      where: { stockId: stock.id },
      include: { portfolio: { include: { owner: true } } },
      orderBy: { entryDate: "asc" },
    }),
    prisma.claim.findMany({
      where: { stockId: stock.id },
      include: { source: true, portfolio: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.catalystEvent.findMany({
      where: { stockId: stock.id },
      orderBy: { date: "asc" },
    }),
  ]);

  const points = closes.map((c) => ({
    date: fmtDayShort(c.date),
    close: c.close,
  }));
  const dayChange =
    stock.lastClose != null && stock.prevClose != null && stock.prevClose > 0
      ? ((stock.lastClose - stock.prevClose) / stock.prevClose) * 100
      : null;

  const open = positions.filter((p) => p.status === "OPEN");
  const entries: EntryLine[] = open.map((p, i) => ({
    label: p.portfolio.name,
    price: p.entryPrice,
    color: ENTRY_COLORS[i % ENTRY_COLORS.length],
  }));

  const windows: Array<{ label: string; days: number }> = [
    { label: "1M", days: 21 },
    { label: "3M", days: 63 },
    { label: "6M", days: 126 },
    { label: "1Y", days: 250 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title={stock.name}
        accent={`#${stock.symbol}`}
        sub={`${stock.exchange} · closes settle nightly from the exchange bhavcopy${
          stock.closeDate ? ` · last close ${fmtDate(stock.closeDate)}` : ""
        }`}
      />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-6">
        <div className="font-display font-bold text-5xl">{priceOpt(stock.lastClose)}</div>
        {dayChange !== null && (
          <div className={`text-lg font-semibold ${dayChange >= 0 ? "text-groww" : "text-loss"}`}>
            {dayChange >= 0 ? "▲" : "▼"} {pct(dayChange)} on the day
            <span className="text-muted font-normal text-sm"> · prev {priceOpt(stock.prevClose)}</span>
          </div>
        )}
        <div className="flex gap-4 ml-auto text-sm">
          {windows.map((w) => {
            const r = windowReturn(closes, w.days);
            return (
              <span key={w.label} className="text-muted">
                {w.label}{" "}
                <span className={r === null ? "" : r >= 0 ? "text-groww font-semibold" : "text-loss font-semibold"}>
                  {r === null ? "—" : pct(r)}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-edge bg-panel p-5 mb-8">
        <PriceChart points={points} entries={entries} />
        {entries.length > 0 && (
          <p className="text-xs text-muted mt-3">
            Dashed lines: league entry prices — who bought where, on the same chart.
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h2 className="font-display font-bold text-xl mb-3">In the league</h2>
          {positions.length === 0 && (
            <p className="text-muted text-sm">No portfolio holds this stock yet.</p>
          )}
          <div className="space-y-2">
            {positions.map((p) => {
              const cur = stock.lastClose;
              const pnl =
                cur != null ? ((cur - p.entryPrice) / p.entryPrice) * 100 : null;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-edge bg-panel px-4 py-3 flex items-center gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/portfolios/${p.portfolioId}`}
                      className="font-semibold hover:text-groww"
                    >
                      {p.portfolio.name}
                    </Link>
                    <div className="text-muted text-xs">
                      {p.portfolio.owner.name} · {p.status} · in {fmtDate(p.entryDate)} @{" "}
                      {price(p.entryPrice)}
                      {p.units ? ` · ${unitsFmt(stock.exchange, p.units)} units` : ""}
                    </div>
                  </div>
                  <span
                    className={`ml-auto font-semibold ${
                      pnl === null ? "text-muted" : pnl >= 0 ? "text-groww" : "text-loss"
                    }`}
                  >
                    {pnl === null ? "—" : pct(pnl)}
                  </span>
                </div>
              );
            })}
          </div>

          {events.length > 0 && (
            <>
              <h2 className="font-display font-bold text-xl mt-8 mb-3">On the calendar</h2>
              <div className="space-y-2">
                {events.map((e) => (
                  <div key={e.id} className="rounded-xl border border-edge bg-panel px-4 py-3 text-sm">
                    <span className="pill mr-2">{e.kind}</span>
                    {e.title}
                    <div className="text-muted text-xs mt-1">{fmtDate(e.date)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="font-display font-bold text-xl mb-3">Claims on this stock</h2>
          {claims.length === 0 && (
            <p className="text-muted text-sm">Nobody has made a checkable claim about this one yet.</p>
          )}
          <div className="space-y-2">
            {claims.map((c) => (
              <div key={c.id} className="rounded-xl border border-edge bg-panel px-4 py-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <div>{c.claimText}</div>
                    <div className="text-muted text-xs mt-1">
                      {c.source.name}
                      {c.portfolio ? ` · ${c.portfolio.name}` : ""} · due {fmtDate(c.dueDate)}
                    </div>
                  </div>
                  <span className="ml-auto shrink-0">
                    <VerdictStamp verdict={c.verdict} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
