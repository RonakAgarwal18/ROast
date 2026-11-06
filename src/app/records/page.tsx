import { prisma } from "@/lib/db";
import { inr, price, pct, fmtDate } from "@/lib/format";
import { PageTitle, VerdictStamp } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const closed = await prisma.position.findMany({
    where: { status: "CLOSED" },
    include: { stock: true, portfolio: true },
    orderBy: { sellDate: "desc" },
  });
  const judged = await prisma.claim.findMany({
    where: { verdict: { not: "ON_THE_STOVE" } },
    include: { stock: true, source: true },
    orderBy: { dueDate: "desc" },
  });
  const burntBin = judged.filter((c) => c.verdict === "BURNT");
  const sources = await prisma.source.findMany({
    include: { claims: true, portfolios: { include: { positions: true } } },
  });

  // Per-source stats: claims record + average closed/open pick return (simple mean).
  const sourceStats = sources.map((s) => {
    const total = s.claims.length;
    const wd = s.claims.filter((c) => c.verdict === "WELL_DONE").length;
    const positions = s.portfolios.flatMap((p) => p.positions);
    const avgPick =
      positions.length > 0
        ? positions.reduce(
            (sum, p) => sum + ((p.sellPrice ?? p.entryPrice) - p.entryPrice) / p.entryPrice,
            0
          ) / positions.length
        : 0;
    return { name: s.name, kind: s.kind, total, wd, avgPick: avgPick * 100, picks: positions.length };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Records"
        accent="the graveyard"
        sub="Closed trades, final verdicts, and every source's permanent record. Nothing here can be edited after the fact — that's the point."
      />

      <h2 className="font-display text-2xl font-bold mb-4">Per-source record</h2>
      {sourceStats.length === 0 && (
        <p className="text-muted mb-12">No sources on record yet.</p>
      )}
      <div className="grid md:grid-cols-3 gap-4 mb-12">
        {sourceStats.map((s) => (
          <div key={s.name} className="rounded-2xl border border-edge bg-panel p-5">
            <div className="flex gap-2 items-center">
              <span className="font-display font-bold text-xl">{s.name}</span>
              <span className="pill">{s.kind}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[0.65rem] uppercase tracking-widest text-muted">Claims</div>
                <div className="font-display font-bold">{s.total}</div>
              </div>
              <div>
                <div className="text-[0.65rem] uppercase tracking-widest text-muted">Well-done</div>
                <div className="font-display font-bold text-groww">
                  {s.total ? `${Math.round((s.wd / s.total) * 100)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[0.65rem] uppercase tracking-widest text-muted">Picks</div>
                <div className="font-display font-bold">{s.picks}</div>
              </div>
            </div>
            {s.total > 0 && s.total < 5 && (
              <p className="text-xs text-ambery mt-3">Small sample — fewer than 5 claims. Tasty, not proven.</p>
            )}
          </div>
        ))}
      </div>

      <h2 className="font-display text-2xl font-bold mb-4">
        The Burnt Bin — <span className="font-accent italic font-normal text-loss">hall of fame</span>
      </h2>
      {burntBin.length === 0 ? (
        <p className="text-muted mb-12">
          The bin is empty — no claim has been BURNT yet. The first claim that goes
          disastrously the other way gets framed here, permanently.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {burntBin.map((c) => (
            <div key={c.id} className="rounded-2xl border-2 border-loss/50 bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-2 flex-wrap">
                  <span className="pill">#{c.stock.symbol}</span>
                  <span className="pill">{c.source.name}</span>
                  <span className="pill">due {fmtDate(c.dueDate)}</span>
                </div>
                <VerdictStamp verdict={c.verdict} large />
              </div>
              <p className="mt-3 text-sm leading-relaxed">{c.claimText}</p>
              <p className="mt-2 text-xs text-muted italic">Receipt: “{c.quoteSentence}”</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-display text-2xl font-bold mb-4">Judged claims</h2>
      {judged.length === 0 && (
        <p className="text-muted mb-12">No verdicts yet — everything is still on the stove.</p>
      )}
      <div className="grid md:grid-cols-2 gap-4 mb-12">
        {judged.map((c) => (
          <div key={c.id} className="rounded-2xl border border-edge bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2 flex-wrap">
                <span className="pill">#{c.stock.symbol}</span>
                <span className="pill">{c.source.name}</span>
                <span className="pill">due {fmtDate(c.dueDate)}</span>
              </div>
              <VerdictStamp verdict={c.verdict} />
            </div>
            <p className="mt-3 text-sm leading-relaxed">{c.claimText}</p>
          </div>
        ))}
      </div>

      <h2 className="font-display text-2xl font-bold mb-4">Closed trades</h2>
      {closed.length === 0 && <p className="text-muted">No closed trades yet.</p>}
      <div className="space-y-2">
        {closed.map((p) => {
          const pnl = ((p.sellPrice ?? 0) - p.entryPrice) * p.units;
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 text-sm"
            >
              <span className={pnl >= 0 ? "text-groww font-bold" : "text-loss font-bold"}>
                {pnl >= 0 ? "▲" : "▼"}
              </span>
              <span className="font-semibold">{p.stock.name}</span>
              <span className="text-muted">
                {p.portfolio.name} · {price(p.entryPrice)} → {p.sellPrice ? price(p.sellPrice) : "—"} ·{" "}
                {p.sellDate ? fmtDate(p.sellDate) : ""}
              </span>
              <span className={`ml-auto font-display font-bold ${pnl >= 0 ? "text-groww" : "text-loss"}`}>
                {inr(pnl)} ({pct(((p.sellPrice ?? p.entryPrice) - p.entryPrice) / p.entryPrice * 100)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
