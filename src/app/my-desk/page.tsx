import { prisma } from "@/lib/db";
import { inr, price, priceOpt, pct, fmtDate } from "@/lib/format";
import { addDayNote, updateStockClose, updateOrder, deleteOrder } from "@/lib/actions";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

export default async function MyDeskPage() {
  const real = await prisma.portfolio.findFirst({
    where: { isReal: true },
    include: { positions: { include: { stock: true } } },
  });
  const orders = await prisma.order.findMany({
    include: { stock: true },
    orderBy: { createdAt: "desc" },
  });
  const rules = await prisma.rule.findMany({ orderBy: { id: "asc" } });
  const notes = await prisma.dayNote.findMany({ orderBy: { date: "desc" } });

  const open = real?.positions.filter((p) => p.status === "OPEN") ?? [];
  const invested = open.reduce((s, p) => s + p.units * p.entryPrice, 0);
  const market = open.reduce((s, p) => s + p.units * (p.stock.lastClose ?? 0), 0);
  const closesAsOf = open.reduce<Date | null>(
    (acc, p) => (p.stock.closeDate && (!acc || p.stock.closeDate > acc) ? p.stock.closeDate : acc),
    null
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="My Desk"
        accent="real money"
        sub={`Ronak's actual holdings, mirrored into the league. Invested ${inr(invested)} · now ${inr(market)} · closes as of ${closesAsOf ? fmtDate(closesAsOf) : "—"}.`}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Holdings + pending order */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-edge overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-panel2 text-left text-muted uppercase text-xs tracking-wider">
                  <th className="px-4 py-3">Holding</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Avg</th>
                  <th className="px-4 py-3 text-right">Close</th>
                  <th className="px-4 py-3 text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => {
                  const pnl =
                    p.stock.lastClose !== null
                      ? (p.stock.lastClose - p.entryPrice) * p.units
                      : null;
                  const pnlPct =
                    p.stock.lastClose !== null
                      ? ((p.stock.lastClose - p.entryPrice) / p.entryPrice) * 100
                      : null;
                  return (
                    <tr key={p.id} className="border-t border-edge/60 bg-panel">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{p.stock.name}</div>
                        {p.tag && (
                          <span className="pill border-ambery/60 text-ambery mt-1">{p.tag}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{p.units}</td>
                      <td className="px-4 py-3 text-right">{price(p.entryPrice)}</td>
                      <td className="px-4 py-3 text-right">
                        <form action={updateStockClose} className="inline-flex gap-1 items-center justify-end">
                          <input type="hidden" name="stockId" value={p.stock.id} />
                          <input
                            name="lastClose"
                            type="number"
                            step="any"
                            defaultValue={p.stock.lastClose ?? ""}
                            placeholder={priceOpt(p.stock.lastClose)}
                            className="w-24 rounded-md border border-edge bg-base px-2 py-1 text-right text-sm"
                            title="Quick-update the close"
                          />
                          <button className="pill hover:bg-panel2 cursor-pointer">set</button>
                        </form>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-display font-bold ${
                          pnl === null ? "text-muted" : pnl >= 0 ? "text-groww" : "text-loss"
                        }`}
                      >
                        {pnl === null ? "—" : <>{inr(pnl)} <span className="text-xs">({pct(pnlPct ?? 0)})</span></>}
                      </td>
                    </tr>
                  );
                })}
                {open.length === 0 && (
                  <tr className="border-t border-edge/60 bg-panel">
                    <td colSpan={5} className="px-4 py-6 text-muted">
                      No real holdings on the desk right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pending orders */}
          {orders.length === 0 && (
            <div className="rounded-2xl border border-edge bg-panel p-5 text-sm text-muted">
              No pending orders on the desk.
            </div>
          )}
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-ambery/50 bg-panel p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-lg">Pending order — {o.stock.name}</span>
                <span className="stamp text-ambery">{o.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="pill">{o.qty} shares</span>
                <span className="pill">limit {price(o.limitPrice)}</span>
                {o.targetLow && o.targetHigh && (
                  <span className="pill">target {price(o.targetLow)}–{price(o.targetHigh)}</span>
                )}
                {o.exitPrice && <span className="pill">exit {price(o.exitPrice)}</span>}
                <span className="pill">total {inr(o.qty * o.limitPrice)}</span>
              </div>
              <p className="text-xs text-muted mt-3">
                Fills only if the stock trades at or below the limit. Above ~₹365 the plan is to
                re-think, not chase.
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted">Fix this order…</summary>
                <form action={updateOrder} className="mt-3 flex flex-wrap gap-3 items-end">
                  <input type="hidden" name="orderId" value={o.id} />
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Qty
                    <input name="qty" type="number" step="any" defaultValue={o.qty} className={`${inputCls} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Limit ₹
                    <input name="limitPrice" type="number" step="any" defaultValue={o.limitPrice} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Target low ₹
                    <input name="targetLow" type="number" step="any" defaultValue={o.targetLow ?? ""} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Target high ₹
                    <input name="targetHigh" type="number" step="any" defaultValue={o.targetHigh ?? ""} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Exit ₹
                    <input name="exitPrice" type="number" step="any" defaultValue={o.exitPrice ?? ""} className={`${inputCls} w-24`} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Status
                    <select name="status" defaultValue={o.status} className={`${inputCls} w-32`}>
                      <option value="PLACED">PLACED</option>
                      <option value="FILLED">FILLED</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </label>
                  <button className="rounded-full bg-groww text-black font-display font-bold px-5 py-2 hover:brightness-110 cursor-pointer">
                    Save fix
                  </button>
                </form>
                <form action={deleteOrder} className="mt-3">
                  <input type="hidden" name="orderId" value={o.id} />
                  <details>
                    <summary className="cursor-pointer text-xs text-loss">Delete this order…</summary>
                    <button className="mt-2 pill border-loss/60 text-loss hover:bg-panel2 cursor-pointer">
                      Yes, delete it
                    </button>
                  </details>
                </form>
              </details>
            </div>
          ))}

          {/* Day notes */}
          <div className="rounded-2xl border border-edge bg-panel p-5">
            <h2 className="font-display text-xl font-bold mb-3">Day notes</h2>
            <form action={addDayNote} className="flex gap-2 mb-4">
              <input name="text" required placeholder="One line about today…" className={`${inputCls} flex-1`} />
              <button className="rounded-full bg-groww text-black font-display font-bold px-4 cursor-pointer hover:brightness-110">
                Add
              </button>
            </form>
            <ul className="space-y-2 text-sm">
              {notes.length === 0 && <li className="text-muted">No notes yet — the first line above starts the journal.</li>}
              {notes.map((n) => (
                <li key={n.id} className="flex gap-3">
                  <span className="pill shrink-0">{fmtDate(n.date)}</span>
                  <span className="text-cream/90">{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Rules panel */}
        <aside className="rounded-2xl border border-edge bg-panel p-5 h-fit">
          <h2 className="font-display text-xl font-bold">
            Rules of <span className="font-accent italic font-normal text-groww">my</span> kitchen
          </h2>
          <ul className="mt-4 space-y-3">
            {rules.map((r, i) => (
              <li key={r.id} className="flex gap-3 text-sm leading-relaxed">
                <span className="font-display font-bold text-groww">{String(i + 1).padStart(2, "0")}</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-5">
            The alert lines: ±7% in a day, ±12% over three sessions. The desk records; the
            scheduled watch does the watching.
          </p>
        </aside>
      </div>
    </div>
  );
}
