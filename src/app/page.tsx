import Link from "next/link";
import { leagueRows } from "@/lib/stats";
import { inr, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Rotating circular badge: PASTE · PARSE · PROOF · ROAST · */
function RotatingBadge() {
  const text = "PASTE · PARSE · PROOF · ROAST · ";
  return (
    <div className="relative w-28 h-28 animate-roast-spin select-none" aria-hidden>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <path id="circ" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
        </defs>
        <text className="fill-ambery" style={{ fontSize: "10.5px", letterSpacing: "2.5px", fontWeight: 700 }}>
          <textPath href="#circ">{text}</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-groww text-lg">
        RO
      </div>
    </div>
  );
}

export default async function Home() {
  const rows = await leagueRows().catch(() => []);
  const leader = rows[0];
  const stove = rows.length;

  return (
    <div>
      {/* ---------- Hero (Adspace-style: black, glow, giant type) ---------- */}
      <section className="hero-glow relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 relative">
          <div className="absolute right-6 top-10 hidden md:block">
            <RotatingBadge />
          </div>
          <p className="pill border-groww/50 text-groww mb-6">The AI stock-tip accountability league</p>
          <h1 className="font-display font-bold tracking-tight leading-[0.95] text-6xl md:text-8xl max-w-4xl">
            We ROast the tip,{" "}
            <span className="font-accent italic font-normal text-groww">before</span> it burns
            your money.
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl">
            AIs serve hot stock picks every day. ROast puts each one into a paper portfolio,
            writes its claims down with dates and receipts — and judges what actually happened.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/league"
              className="rounded-full bg-groww text-black font-display font-bold px-6 py-3 hover:brightness-110"
            >
              See the league
            </Link>
            <Link
              href="/add"
              className="rounded-full border-2 border-cream/70 font-display font-bold px-6 py-3 hover:border-groww hover:text-groww"
            >
              Paste an analysis
            </Link>
          </div>

          {/* Live league snapshot strip */}
          {leader && (
            <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-edge bg-panel/80 p-4">
                <div className="text-xs uppercase tracking-widest text-muted">League leader</div>
                <div className="font-display text-2xl font-bold mt-1">
                  {leader.name} <span className="text-ambery text-base">👑 HEAD CHEF</span>
                </div>
              </div>
              <div className="rounded-xl border border-edge bg-panel/80 p-4">
                <div className="text-xs uppercase tracking-widest text-muted">Leader return</div>
                <div className={`font-display text-2xl font-bold mt-1 ${leader.returnPct >= 0 ? "text-groww" : "text-loss"}`}>
                  {pct(leader.returnPct)}
                </div>
              </div>
              <div className="rounded-xl border border-edge bg-panel/80 p-4">
                <div className="text-xs uppercase tracking-widest text-muted">Portfolios in the kitchen</div>
                <div className="font-display text-2xl font-bold mt-1">{stove}</div>
              </div>
              <div className="rounded-xl border border-edge bg-panel/80 p-4">
                <div className="text-xs uppercase tracking-widest text-muted">Benchmark · NIFTY</div>
                <div className="font-display text-2xl font-bold mt-1">{inr(24536.6, 2)}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-3xl md:text-4xl font-bold">
          Paste → Parse → <span className="font-accent italic font-normal text-groww">Proof</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {[
            {
              n: "01",
              t: "Paste",
              d: "Drop in any AI's stock analysis — or use our Prompt Kit to make the AI answer in a format we can read perfectly.",
            },
            {
              n: "02",
              t: "Parse",
              d: "ROast pulls out the stocks, the paper orders, and every dated claim — each claim keeps the AI's exact sentence as its receipt.",
            },
            {
              n: "03",
              t: "Proof",
              d: "When the date arrives, the checklist gets judged: WELL-DONE, HALF-COOKED, ROASTED or BURNT. No claim is ever quietly forgotten.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-edge bg-panel p-6">
              <div className="font-display text-ambery font-bold">{s.n}</div>
              <div className="font-display text-2xl font-bold mt-2">{s.t}</div>
              <p className="text-muted mt-2 text-sm leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- The verdict scale ---------- */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-xl border border-edge bg-panel p-6 md:p-8 flex flex-wrap items-center gap-x-8 gap-y-4">
          <span className="font-display font-bold text-xl">The kitchen scale:</span>
          <span className="stamp text-muted">On the stove</span>
          <span className="stamp text-groww">Well-done</span>
          <span className="stamp text-ambery">Half-cooked</span>
          <span className="stamp text-loss">Roasted</span>
          <span className="stamp text-loss">Burnt</span>
          <span className="stamp text-muted">No recipe</span>
        </div>
      </section>

      {/* ---------- Disclaimer ---------- */}
      <section className="border-t border-edge/70">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">
          <strong className="text-cream">The rule of the house:</strong> ROast is a scorekeeper,
          never a tipster. We make no buy or sell recommendations of our own — we only record
          what public sources already claimed, with the source and the date, and publish what
          actually happened. Paper portfolios use virtual money. Nothing here is investment advice.
        </div>
      </section>
    </div>
  );
}
