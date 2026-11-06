import { prisma } from "@/lib/db";
import { inr, price, pct, fmtDate } from "@/lib/format";
import { addDayNote, updateStockClose } from "@/lib/actions";
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
  const market = open.reduce((s, p) => s + p.units * p.stock.lastClose, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="My Desk"
        accent="real money"
        sub={`Ronak's actual holdings, mirrored into the league. Invested ${inr(invested)} · now ${inr(market)} · closes as of 5 Nov 2026.`}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Holdings + pending order */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-edge overflow-hidden">
            <table className="w-full text-sm">
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
                  const pnl = (p.stock.lastClose - p.entryPrice) * p.units;
                  const pnlPct = ((p.stock.lastClose - p.entryPrice) / p.entryPrice) * 100;
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
                            defaultValue={p.stock.lastClose}
                            className="w-24 rounded-md border border-edge bg-base px-2 py-1 text-right text-sm"
                            title="Quick-update the close"
                          />
                          <button className="pill hover:bg-panel2 cursor-pointer">set</button>
                        </form>
                      </td>
                      <td className={`px-4 py-3 text-right font-display font-bold ${pnl >= 0 ? "text-groww" : "text-loss"}`}>
                        {inr(pnl)} <span className="text-xs">({pct(pnlPct)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pending orders */}
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
