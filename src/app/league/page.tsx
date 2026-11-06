import Link from "next/link";
import { leagueRows } from "@/lib/stats";
import { inr, pct } from "@/lib/format";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const rows = await leagueRows();
  const leader = rows[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="The League"
        accent="table"
        sub="Every portfolio ranked by return. Paper money, real receipts. Prices settle on the last close — as of 5 Nov 2026."
      />

      {/* Morocco-style giant hero number: the leader's return */}
      {leader && (
        <div className="rounded-2xl border border-edge bg-panel p-8 mb-8 hero-glow">
          <div className="text-xs uppercase tracking-[0.25em] text-muted">
            Top of the table — {leader.name}
          </div>
          <div
            className={`font-display font-bold leading-none mt-2 text-7xl md:text-8xl ${
              leader.returnPct >= 0 ? "text-groww" : "text-loss"
            }`}
          >
            {pct(leader.returnPct)}
          </div>
          <div className="mt-3 text-muted">
            {leader.ownerName} · {leader.isReal ? "real money" : `virtual ${inr(leader.startingCash)}`} ·{" "}
            {leader.wellDone} well-done claims so far
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-edge overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel2 text-left text-muted uppercase text-xs tracking-wider">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Portfolio</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Return</th>
              <th className="px-4 py-3 text-right">Well-done claims</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-edge/60 bg-panel hover:bg-panel2/60">
                <td className="px-4 py-4 font-display font-bold text-lg">{i + 1}</td>
                <td className="px-4 py-4">
                  <Link href={`/portfolios/${r.id}`} className="font-display font-bold text-base hover:text-groww">
                    {r.name}
                  </Link>
                  {i === 0 && <span className="stamp text-ambery ml-3">👑 Head Chef</span>}
                  {i === rows.length - 1 && rows.length > 1 && (
                    <span className="stamp text-loss ml-3">Burnt</span>
                  )}
                  {r.isReal && <span className="pill ml-3">real ₹</span>}
                </td>
                <td className="px-4 py-4">
                  <span className="pill">{r.ownerName}</span>
                  <span className="pill ml-2">{r.ownerKind}</span>
                </td>
                <td className="px-4 py-4 text-right font-semibold">{inr(r.totalValue)}</td>
                <td className={`px-4 py-4 text-right font-display font-bold ${r.returnPct >= 0 ? "text-groww" : "text-loss"}`}>
                  {pct(r.returnPct)}
                </td>
                <td className="px-4 py-4 text-right">
                  {r.wellDone} <span className="text-muted">/ {r.claimsTotal}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted mt-4">
        Returns are computed from entry prices against the last recorded close. A source with
        very few claims is labelled by its record, not crowned by luck — sample sizes live on
        the Records page.
      </p>
    </div>
  );
}
