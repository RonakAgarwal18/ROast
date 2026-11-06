import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { inr, price, pct, fmtDate } from "@/lib/format";
import { addPosition, closePosition } from "@/lib/actions";
import { PageTitle, VerdictStamp } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

export default async function PortfolioDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      owner: true,
      positions: { include: { stock: true }, orderBy: { entryDate: "asc" } },
      claims: { include: { stock: true, items: true }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!portfolio) notFound();

  const stocks = await prisma.stock.findMany({ orderBy: { name: "asc" } });
  const open = portfolio.positions.filter((p) => p.status === "OPEN");
  const invested = open.reduce((s, p) => s + p.units * p.entryPrice, 0);
  const market = open.reduce((s, p) => s + p.units * p.stock.lastClose, 0);
  const firstStock = stocks[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title={portfolio.name}
        sub={`${portfolio.owner.name} (${portfolio.owner.kind}) · ${
          portfolio.isReal
            ? "real money — mirrored for the league"
            : `started with ${inr(portfolio.startingCash)} virtual · cash left ${inr(portfolio.cash)}`
        } · open positions worth ${inr(market)} on ${inr(invested)} deployed`}
      />

      {/* Holdings */}
      <div className="rounded-2xl border border-edge overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel2 text-left text-muted uppercase text-xs tracking-wider">
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3 text-right">Units</th>
              <th className="px-4 py-3 text-right">Entry</th>
              <th className="px-4 py-3 text-right">Last close</th>
              <th className="px-4 py-3 text-right">P&amp;L</th>
              <th className="px-4 py-3">Tag</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {open.map((p) => {
              const pnl = (p.stock.lastClose - p.entryPrice) * p.units;
              const pnlPct = ((p.stock.lastClose - p.entryPrice) / p.entryPrice) * 100;
              return (
                <tr key={p.id} className="border-t border-edge/60 bg-panel">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{p.stock.name}</div>
                    <div className="text-xs text-muted">
                      #{p.stock.symbol} · in {fmtDate(p.entryDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{p.units.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{price(p.entryPrice)}</td>
                  <td className="px-4 py-3 text-right">{price(p.stock.lastClose)}</td>
                  <td className={`px-4 py-3 text-right font-display font-bold ${pnl >= 0 ? "text-groww" : "text-loss"}`}>
                    {inr(pnl)} <span className="text-xs">({pct(pnlPct)})</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.tag && <span className="pill border-ambery/60 text-ambery">{p.tag}</span>}
                    {p.targetPrice && <span className="pill ml-1">target {price(p.targetPrice)}</span>}
                    {p.exitPrice && <span className="pill ml-1">exit {price(p.exitPrice)}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={closePosition} className="flex gap-1 justify-end">
                      <input type="hidden" name="positionId" value={p.id} />
                      <input
                        name="sellPrice"
                        type="number"
                        step="any"
                        required
                        placeholder="Sell ₹"
                        className={`${inputCls} w-24`}
                      />
                      <button className="pill border-loss/60 text-loss hover:bg-panel2 cursor-pointer">
                        Close
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {open.length === 0 && (
              <tr className="border-t border-edge/60 bg-panel">
                <td colSpan={7} className="px-4 py-6 text-muted">
                  Nothing on the stove yet. Add a position below, or paste an analysis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manual add position — entry price defaults to the last close, fully editable */}
      <form
        action={addPosition}
        className="rounded-2xl border border-edge bg-panel p-5 mb-10 flex flex-wrap gap-3 items-end"
      >
        <input type="hidden" name="portfolioId" value={portfolio.id} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Stock
          <select name="stockId" className={`${inputCls} w-56`} defaultValue={firstStock?.id}>
            {stocks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (#{s.symbol}) — close {price(s.lastClose)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          ₹ amount to deploy
          <input name="amount" type="number" step="any" placeholder="10000" className={`${inputCls} w-32`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          or units
          <input name="units" type="number" step="any" placeholder="units" className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Entry price (₹) — yours, not the close
          <input name="entryPrice" type="number" step="any" required placeholder="e.g. 173" className={`${inputCls} w-32`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Date
          <input name="entryDate" type="date" className={`${inputCls} w-40`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Target ₹
          <input name="targetPrice" type="number" step="any" className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Exit ₹
          <input name="exitPrice" type="number" step="any" className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Tag
          <input name="tag" placeholder="optional" className={`${inputCls} w-32`} />
        </label>
        <button className="rounded-full bg-groww text-black font-display font-bold px-5 py-2 hover:brightness-110 cursor-pointer">
          Add position
        </button>
        <p className="w-full text-xs text-muted">
          The last close is only a pre-fill in the dropdown — the entry price you type is the
          price this portfolio is scored on.
        </p>
      </form>

      {/* Claims attached to this portfolio */}
      {portfolio.claims.length > 0 && (
        <>
          <h2 className="font-display text-2xl font-bold mb-4">Claims served from this kitchen</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {portfolio.claims.map((c) => (
              <div key={c.id} className="rounded-2xl border border-edge bg-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2 flex-wrap">
                    <span className="pill">#{c.stock.symbol}</span>
                    <span className="pill">due {fmtDate(c.dueDate)}</span>
                  </div>
                  <VerdictStamp verdict={c.verdict} />
                </div>
                <p className="mt-3 text-sm leading-relaxed">{c.claimText}</p>
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  {c.items.map((it) => (
                    <li key={it.id}>· {it.label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
