import Link from "next/link";
import { prisma } from "@/lib/db";
import { portfolioRows, allSnapshots, type SnapshotPoint } from "@/lib/stats";
import { inr, pct } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { EquityChart, type CurveSeries } from "@/components/Sparkline";

export const dynamic = "force-dynamic";

const COLORS = ["#00D09C", "#FFB547", "#EDF3EA", "#FF6B5E"];

/** Return over the snapshot window minus NIFTY's move over the same window. */
function vsNifty(points: SnapshotPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first.totalValue || first.niftyClose === null || last.niftyClose === null) return null;
  const pf = (last.totalValue / first.totalValue - 1) * 100;
  const nf = (last.niftyClose / first.niftyClose - 1) * 100;
  return pf - nf;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rows = await portfolioRows();
  const snaps = await allSnapshots();

  const picked = (Array.isArray(sp.pick) ? sp.pick : sp.pick ? [sp.pick] : [])
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));
  const selected = (
    picked.length >= 2 ? rows.filter((r) => picked.includes(r.id)) : rows.slice(0, 3)
  ).slice(0, 3);

  // Best / worst pick per portfolio + claims accuracy.
  const detail = new Map<
    number,
    { best: string; worst: string; judged: number; wellDonePct: number | null }
  >();
  for (const r of selected) {
    const positions = await prisma.position.findMany({
      where: { portfolioId: r.id },
      include: { stock: true },
    });
    const scored = positions
      .map((p) => {
        const exit = p.status === "CLOSED" ? p.sellPrice ?? p.entryPrice : p.stock.lastClose;
        if (exit === null) return null;
        const ret = ((exit - p.entryPrice) / p.entryPrice) * 100;
        return { label: `${p.stock.name} (${pct(ret)})`, ret };
      })
      .filter((x): x is { label: string; ret: number } => x !== null)
      .sort((a, b) => b.ret - a.ret);
    const claims = await prisma.claim.findMany({ where: { portfolioId: r.id } });
    const judgedClaims = claims.filter((c) => c.verdict !== "ON_THE_STOVE");
    const wd = judgedClaims.filter((c) => c.verdict === "WELL_DONE").length;
    detail.set(r.id, {
      best: scored[0]?.label ?? "—",
      worst: scored.length > 1 ? scored[scored.length - 1].label : "—",
      judged: judgedClaims.length,
      wellDonePct: judgedClaims.length ? (wd / judgedClaims.length) * 100 : null,
    });
  }

  const series: CurveSeries[] = selected.map((r, i) => ({
    name: r.name,
    color: COLORS[i % COLORS.length],
    points: (snaps.get(r.id) ?? []).map((s) => ({ date: s.date, value: s.totalValue })),
  }));

  const metrics: Array<{
    label: string;
    render: (r: (typeof selected)[number]) => React.ReactNode;
  }> = [
    { label: "Current value", render: (r) => inr(r.totalValue) },
    { label: "Cash left", render: (r) => (r.isReal ? "—" : inr(r.cash)) },
    {
      label: "Return",
      render: (r) => (
        <span className={r.returnPct >= 0 ? "text-groww" : "text-loss"}>{pct(r.returnPct)}</span>
      ),
    },
    {
      label: "vs NIFTY (snapshot window)",
      render: (r) => {
        const v = vsNifty(snaps.get(r.id) ?? []);
        if (v === null) return <span className="text-muted">needs 2+ snapshot days</span>;
        return <span className={v >= 0 ? "text-groww" : "text-loss"}>{pct(v)}</span>;
      },
    },
    { label: "Best pick", render: (r) => detail.get(r.id)?.best ?? "—" },
    { label: "Worst pick", render: (r) => detail.get(r.id)?.worst ?? "—" },
    {
      label: "Claims accuracy (well-done of judged)",
      render: (r) => {
        const d = detail.get(r.id);
        if (!d || d.judged === 0) return <span className="text-muted">nothing judged yet</span>;
        return `${d.wellDonePct?.toFixed(0)}% of ${d.judged} judged`;
      },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Compare"
        accent="side by side"
        sub="Pick any two or three kitchens and put their records next to each other — returns, benchmark honesty, best and worst picks, and how their claims actually scored."
      />

      {/* Picker — plain GET form, selection travels as ?pick=1&pick=2 */}
      <form method="get" className="rounded-2xl border border-edge bg-panel p-5 mb-8">
        <div className="flex flex-wrap gap-3 items-center">
          {rows.map((r) => (
            <label
              key={r.id}
              className="inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1.5 text-sm cursor-pointer hover:border-groww/60"
            >
              <input
                type="checkbox"
                name="pick"
                value={r.id}
                defaultChecked={selected.some((s) => s.id === r.id)}
                className="accent-[#00D09C]"
              />
              {r.name}
            </label>
          ))}
          <button
            className="rounded-full bg-groww text-black font-display font-bold px-5 py-2 hover:brightness-110 cursor-pointer"
            type="submit"
          >
            Compare
          </button>
        </div>
        <p className="text-xs text-muted mt-3">Tick 2–3 portfolios and hit Compare.</p>
      </form>

      {/* Equity curves */}
      <div className="rounded-2xl border border-edge bg-panel p-5 mb-8">
        <h2 className="font-display text-xl font-bold mb-3">Equity curves</h2>
        <EquityChart series={series} />
      </div>

      {/* Metric table */}
      <div className="rounded-2xl border border-edge overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-panel2 text-left text-muted uppercase text-xs tracking-wider">
              <th className="px-4 py-3">Metric</th>
              {selected.map((r, i) => (
                <th key={r.id} className="px-4 py-3">
                  <Link
                    href={`/portfolios/${r.id}`}
                    className="font-display font-bold text-sm normal-case tracking-normal hover:underline"
                    style={{ color: COLORS[i % COLORS.length] }}
                  >
                    {r.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label} className="border-t border-edge/60 bg-panel">
                <td className="px-4 py-3 text-muted">{m.label}</td>
                {selected.map((r) => (
                  <td key={r.id} className="px-4 py-3 font-semibold">
                    {m.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted mt-4">
        Open picks are scored at the last recorded close; closed picks at their actual sell
        price. Curves are built from daily PortfolioSnapshot rows written by the price
        pipeline.
      </p>
    </div>
  );
}
