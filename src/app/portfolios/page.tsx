import Link from "next/link";
import { portfolioRows } from "@/lib/stats";
import { inr, pct } from "@/lib/format";
import { createPortfolio } from "@/lib/actions";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

export default async function PortfoliosPage() {
  const rows = await portfolioRows();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Portfolios"
        accent="unlimited"
        sub="One paper kitchen per source. Name it, fund it with any virtual amount, and let its record speak."
      />

      <div className="mb-6">
        <Link
          href="/portfolios/compare"
          className="pill border-groww/60 text-groww hover:bg-groww-dim !py-1.5 !px-4 text-sm"
        >
          ⚖ Compare portfolios side by side →
        </Link>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/portfolios/${r.id}`}
            className="rounded-2xl border border-edge bg-panel p-5 hover:border-groww/60 block"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-xl">{r.name}</span>
              {r.isReal && <span className="pill border-ambery/60 text-ambery">real ₹</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <span className="pill">{r.ownerName}</span>
              <span className="pill">{r.ownerKind}</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[0.65rem] uppercase tracking-widest text-muted">Value</div>
                <div className="font-display font-bold">{inr(r.totalValue)}</div>
              </div>
              <div>
                <div className="text-[0.65rem] uppercase tracking-widest text-muted">Return</div>
                <div className={`font-display font-bold ${r.returnPct >= 0 ? "text-groww" : "text-loss"}`}>
                  {pct(r.returnPct)}
                </div>
              </div>
              <div>
                <div className="text-[0.65rem] uppercase tracking-widest text-muted">Cash</div>
                <div className="font-display font-bold">{r.isReal ? "—" : inr(r.cash)}</div>
              </div>
            </div>
          </Link>
        ))}

        {/* Create a portfolio */}
        <form
          action={createPortfolio}
          className="rounded-2xl border border-dashed border-edge bg-panel/50 p-5 flex flex-col gap-3"
        >
          <div className="font-display font-bold text-xl">+ New portfolio</div>
          <input name="name" required placeholder="Portfolio name (e.g. Grok)" className={inputCls} />
          <input name="owner" required placeholder="Source name (e.g. Grok)" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <select name="ownerKind" className={inputCls} defaultValue="AI">
              <option value="AI">AI source</option>
              <option value="HUMAN">Human</option>
            </select>
            <select name="sizingRule" className={inputCls} defaultValue="FIXED">
              <option value="FIXED">Fixed ₹ / pick</option>
              <option value="PERCENT">% of portfolio</option>
            </select>
          </div>
          <input
            name="startingCash"
            type="number"
            step="any"
            defaultValue={100000}
            placeholder="Starting virtual cash (₹)"
            className={inputCls}
          />
          <button className="rounded-full bg-groww text-black font-display font-bold py-2 hover:brightness-110 cursor-pointer">
            Open the kitchen
          </button>
        </form>
      </div>
    </div>
  );
}
