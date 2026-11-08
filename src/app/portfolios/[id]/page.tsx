import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { portfolioSnapshots } from "@/lib/stats";
import { inr, price, priceOpt, pct, fmtDate, unitsFmt } from "@/lib/format";
import { addPosition, closePosition, updatePosition, deletePosition } from "@/lib/actions";
import { PageTitle, VerdictStamp } from "@/components/ui";
import { EquityChart } from "@/components/Sparkline";
import StockPicker from "@/components/StockPicker";

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

  const snaps = await portfolioSnapshots(portfolio.id);
  const open = portfolio.positions.filter((p) => p.status === "OPEN");
  const invested = open.reduce((s, p) => s + p.units * p.entryPrice, 0);
  const market = open.reduce((s, p) => s + p.units * (p.stock.lastClose ?? 0), 0);

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

      {/* Equity curve from daily snapshots */}
      <div className="rounded-2xl border border-edge bg-panel p-5 mb-8">
        <h2 className="font-display text-xl font-bold mb-3">Equity curve</h2>
        <EquityChart
          series={[
            {
              name: portfolio.name,
              color: "#00D09C",
              points: snaps.map((s) => ({ date: s.date, value: s.totalValue })),
            },
          ]}
          height={110}
        />
        {snaps.length === 1 && (
          <p className="text-xs text-muted mt-2">
            Baseline frozen on {fmtDate(snaps[0].date)} — the curve draws itself as the price
            pipeline writes a snapshot per trading day.
          </p>
        )}
      </div>

      {/* Holdings */}
      <div className="rounded-2xl border border-edge overflow-x-auto mb-8">
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
              const pnl =
                p.stock.lastClose !== null ? (p.stock.lastClose - p.entryPrice) * p.units : null;
              const pnlPct =
                p.stock.lastClose !== null
                  ? ((p.stock.lastClose - p.entryPrice) / p.entryPrice) * 100
                  : null;
              return (
                <tr key={p.id} className="border-t border-edge/60 bg-panel">
                  <td className="px-4 py-3">
                    <Link href={`/stocks/${encodeURIComponent(p.stock.symbol)}`} className="font-semibold hover:text-groww">{p.stock.name}</Link>
                    <div className="text-xs text-muted">
                      #{p.stock.symbol} · in {fmtDate(p.entryDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{unitsFmt(p.stock.exchange, p.units)}</td>
                  <td className="px-4 py-3 text-right">{price(p.entryPrice)}</td>
                  <td className="px-4 py-3 text-right">{priceOpt(p.stock.lastClose)}</td>
                  <td
                    className={`px-4 py-3 text-right font-display font-bold ${
                      pnl === null ? "text-muted" : pnl >= 0 ? "text-groww" : "text-loss"
                    }`}
                  >
                    {pnl === null ? (
                      "—"
                    ) : (
                      <>
                        {inr(pnl)} <span className="text-xs">({pct(pnlPct ?? 0)})</span>
                      </>
                    )}
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
          Stock — search the full master
          <StockPicker name="stockId" />
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
          Search finds any stock in the master; the price shown is its last close. Shares are
          whole numbers only — a ₹ amount floors to full shares and the rest stays as cash.
          The entry price you type is the price this portfolio is scored on.
        </p>
      </form>

      {/* Fix-it: correct any position's record (owner-only actions) */}
      {portfolio.positions.length > 0 && (
        <div className="mb-10">
          <h2 className="font-display text-2xl font-bold mb-4">Fix a position</h2>
          <div className="space-y-3">
            {portfolio.positions.map((p) => (
              <details key={p.id} className="rounded-2xl border border-edge bg-panel px-5 py-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {p.stock.name} <span className="text-muted font-normal">#{p.stock.symbol} · {p.status} · {unitsFmt(p.stock.exchange, p.units)} units @ {price(p.entryPrice)} · in {fmtDate(p.entryDate)}</span>
                </summary>
                <form action={updatePosition} className="mt-4 flex flex-wrap gap-3 items-end">
                  <input type="hidden" name="positionId" value={p.id} />
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Units
                    <input name="units" type="number" step="any" defaultValue={p.units} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Entry ₹
                    <input name="entryPrice" type="number" step="any" defaultValue={p.entryPrice} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Entry date
                    <input name="entryDate" type="date" defaultValue={p.entryDate.toISOString().slice(0, 10)} className={`${inputCls} w-40`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Target ₹
                    <input name="targetPrice" type="number" step="any" defaultValue={p.targetPrice ?? ""} className={`${inputCls} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Exit ₹
                    <input name="exitPrice" type="number" step="any" defaultValue={p.exitPrice ?? ""} className={`${inputCls} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Status
                    <select name="status" defaultValue={p.status} className={`${inputCls} w-28`}>
                      <option value="OPEN">OPEN</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Sell ₹ (if closed)
                    <input name="sellPrice" type="number" step="any" defaultValue={p.sellPrice ?? ""} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Sell date
                    <input name="sellDate" type="date" defaultValue={p.sellDate ? p.sellDate.toISOString().slice(0, 10) : ""} className={`${inputCls} w-40`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Tag
                    <input name="tag" defaultValue={p.tag ?? ""} className={`${inputCls} w-32`} />
                  </label>
                  <button className="rounded-full bg-groww text-black font-display font-bold px-5 py-2 hover:brightness-110 cursor-pointer">
                    Save fix
                  </button>
                </form>
                <form action={deletePosition} className="mt-3">
                  <input type="hidden" name="positionId" value={p.id} />
                  <details>
                    <summary className="cursor-pointer text-xs text-loss">Delete this position…</summary>
                    <button className="mt-2 pill border-loss/60 text-loss hover:bg-panel2 cursor-pointer">
                      Yes, delete it and reconcile the cash
                    </button>
                  </details>
                </form>
              </details>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            Paper portfolios: cash rebalances by the difference automatically. The real
            portfolio's cash is yours to track, so it is left untouched.
          </p>
        </div>
      )}

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
