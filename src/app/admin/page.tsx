import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { uploadBhavcopy, snapshotNow, runPricesNow } from "@/lib/actions";
import { getOwnerSession } from "@/lib/auth";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

type SP = {
  updated?: string;
  date?: string;
  kind?: string;
  snapshots?: string;
  snapped?: string;
  error?: string;
  runstatus?: string;
  runmsg?: string;
  rundate?: string;
};

const istTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);

/** Most recent weekday (Mon–Fri) strictly before today IST — the freshest
    close date a healthy pipeline should show. Market holidays not modelled. */
function lastWeekdayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  do {
    day.setDate(day.getDate() - 1);
  } while (day.getDay() === 0 || day.getDay() === 6);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  // Owner-only (the proxy also gates /admin; this is the server-side
  // check that holds even if the proxy is bypassed).
  if (!(await getOwnerSession())) redirect("/login?next=/admin");
  const [total, priced, latestClose, snapshotCount, lastSnap] = await Promise.all([
    prisma.stock.count(),
    prisma.stock.count({ where: { lastClose: { not: null } } }),
    prisma.stock.findFirst({
      where: { closeDate: { not: null } },
      orderBy: { closeDate: "desc" },
      select: { closeDate: true },
    }),
    prisma.portfolioSnapshot.count(),
    prisma.portfolioSnapshot.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);

  // Freshness: freshest close date per exchange + how many stocks sit on
  // it, the NIFTY row, and the recent pipeline runs.
  const freshGroups = await prisma.stock.groupBy({
    by: ["exchange"],
    where: { closeDate: { not: null } },
    _max: { closeDate: true },
    orderBy: { exchange: "asc" },
  });
  const freshness = await Promise.all(
    freshGroups.map(async (g) => ({
      exchange: g.exchange,
      asOf: g._max.closeDate as Date,
      atDate: await prisma.stock.count({
        where: { exchange: g.exchange, closeDate: g._max.closeDate ?? undefined },
      }),
    }))
  );
  const nifty = await prisma.stock.findUnique({
    where: { symbol: "NIFTY" },
    select: { lastClose: true, closeDate: true },
  });
  const runs = await prisma.priceRun.findMany({ orderBy: { ranAt: "desc" }, take: 6 });
  const freshTarget = lastWeekdayIso();
  const isStale = (d: Date | null | undefined) =>
    !d || d.toISOString().slice(0, 10) < freshTarget;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Price updates"
        accent="the referee's desk"
        sub="ROast settles on daily exchange closes. The site pulls the official bhavcopy itself every evening (Vercel cron, ~7:00 PM IST) and freezes the day's portfolio snapshots — no daily upload needed. The upload below stays as a fallback, and every run is logged in the freshness panel."
      />

      {sp.error === "nofile" && (
        <p className="rounded-xl border border-loss/60 bg-panel px-4 py-3 text-sm text-loss mb-6">
          No file received — pick a bhavcopy CSV first.
        </p>
      )}
      {sp.error === "format" && (
        <p className="rounded-xl border border-loss/60 bg-panel px-4 py-3 text-sm text-loss mb-6">
          That file's format wasn't recognised. Accepted: NSE full bhavdata CSV, NSE index
          close CSV, BSE bhavcopy CSV (UDiFF or legacy).
        </p>
      )}
      {sp.updated && (
        <p className="rounded-xl border border-groww/60 bg-panel px-4 py-3 text-sm mb-6">
          <span className="text-groww font-bold">Done.</span> {sp.updated} stocks updated from
          the {sp.kind} file for {sp.date} · {sp.snapshots} portfolio snapshots written.
        </p>
      )}
      {sp.snapped && (
        <p className="rounded-xl border border-groww/60 bg-panel px-4 py-3 text-sm mb-6">
          <span className="text-groww font-bold">Snapshotted.</span> {sp.snapped} portfolios
          frozen at current closes for {sp.date}.
        </p>
      )}
      {sp.runstatus && (
        <p
          className={`rounded-xl border bg-panel px-4 py-3 text-sm mb-6 ${
            sp.runstatus === "OK" ? "border-groww/60" : "border-loss/60"
          }`}
        >
          <span className={`font-bold ${sp.runstatus === "OK" ? "text-groww" : "text-loss"}`}>
            Price run: {sp.runstatus}
            {sp.rundate ? ` · trading day ${sp.rundate}` : ""}
          </span>{" "}
          <span className="text-muted">{sp.runmsg}</span>
        </p>
      )}

      <div className="grid md:grid-cols-4 gap-3 mb-8">
        {[
          ["Stocks in master", String(total)],
          ["With a close", String(priced)],
          ["Closes as of", latestClose?.closeDate ? fmtDate(latestClose.closeDate) : "—"],
          [
            "Snapshots",
            `${snapshotCount}${lastSnap ? ` · last ${fmtDate(lastSnap.date)}` : ""}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-edge bg-panel p-4">
            <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
            <div className="font-display text-xl font-bold mt-1">{value}</div>
          </div>
        ))}
      </div>

      {/* Freshness panel */}
      <div className="rounded-2xl border border-edge bg-panel p-5 mb-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-xl font-bold">Freshness</h2>
          <form action={runPricesNow}>
            <button className="rounded-full bg-groww text-black font-display font-bold px-5 py-2 hover:brightness-110 cursor-pointer">
              Run prices now →
            </button>
          </form>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          {freshness.map((f) => (
            <div key={f.exchange} className="rounded-xl border border-edge bg-base p-4">
              <div className="text-xs uppercase tracking-widest text-muted">{f.exchange}</div>
              <div className="font-display text-lg font-bold mt-1">
                closes as of {fmtDate(f.asOf)}
              </div>
              <div className="text-xs text-muted mt-1">
                {f.atDate} stocks on that date{" "}
                {isStale(f.asOf) ? (
                  <span className="stamp text-loss ml-1">STALE</span>
                ) : (
                  <span className="stamp text-groww ml-1">FRESH</span>
                )}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-edge bg-base p-4">
            <div className="text-xs uppercase tracking-widest text-muted">NIFTY</div>
            <div className="font-display text-lg font-bold mt-1">
              {nifty?.lastClose ? nifty.lastClose.toLocaleString("en-IN") : "—"}
            </div>
            <div className="text-xs text-muted mt-1">
              as of {nifty?.closeDate ? fmtDate(nifty.closeDate) : "—"}{" "}
              {isStale(nifty?.closeDate) ? (
                <span className="stamp text-loss ml-1">STALE</span>
              ) : (
                <span className="stamp text-groww ml-1">FRESH</span>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Fresh = on the most recent weekday's close ({freshTarget}); market holidays can make
          a healthy pipeline look a day behind. The cron runs daily ~7:00 PM IST and walks back
          to the latest published trading day on its own.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <form
          action={uploadBhavcopy}
          className="rounded-2xl border border-edge bg-panel p-5 flex flex-col gap-4"
        >
          <h2 className="font-display text-xl font-bold">Upload a bhavcopy</h2>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Bhavcopy CSV (NSE / BSE / NSE index file)
            <input name="file" type="file" accept=".csv,text/csv" required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Trading date (optional — the file's own date is used when present)
            <input name="date" type="date" className={inputCls} />
          </label>
          <button className="rounded-full bg-groww text-black font-display font-bold py-2.5 hover:brightness-110 cursor-pointer">
            Run the pipeline →
          </button>
          <div className="text-xs text-muted leading-relaxed">
            <p className="mb-2">Where the files live (free, official):</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>NSE equity: nsearchives.nseindia.com → sec_bhavdata_full_DDMMYYYY.csv</li>
              <li>NSE indices: ind_close_all_DDMMYYYY.csv (updates the NIFTY row)</li>
              <li>BSE equity: bseindia.com → BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.csv</li>
            </ul>
          </div>
        </form>

        <div className="rounded-2xl border border-edge bg-panel p-5 flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold">Freeze today's values</h2>
          <p className="text-sm text-muted leading-relaxed">
            No price file handy? Write today's PortfolioSnapshot rows at the closes currently
            on record. Handy after hand-editing closes on My Desk.
          </p>
          <form action={snapshotNow}>
            <button className="rounded-full border-2 border-cream/60 font-display font-bold px-5 py-2 hover:border-groww hover:text-groww cursor-pointer">
              Snapshot now
            </button>
          </form>
          <p className="text-xs text-muted leading-relaxed">
            The same pipeline also runs from the CLI with{" "}
            <code className="text-cream/80">npx tsx scripts/update-prices.ts</code> and the
            master refreshes with{" "}
            <code className="text-cream/80">npx tsx scripts/load-stock-master.ts</code>.
          </p>
        </div>
      </div>

      {/* Recent runs + export */}
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-2xl border border-edge bg-panel p-5">
          <h2 className="font-display text-xl font-bold mb-3">Recent price runs</h2>
          {runs.length === 0 && (
            <p className="text-sm text-muted">No runs logged yet — the first cron run lands tonight.</p>
          )}
          <ul className="space-y-3">
            {runs.map((r) => (
              <li key={r.id} className="text-sm border-b border-edge/50 pb-2 last:border-0">
                <span className="font-semibold">{istTime(r.ranAt)} IST</span>{" "}
                <span className="pill ml-1">{r.source}</span>{" "}
                <span
                  className={`stamp ml-1 ${r.status === "OK" ? "text-groww" : "text-loss"}`}
                >
                  {r.status}
                </span>
                <div className="text-xs text-muted mt-1">
                  {r.tradeDate ? `trading day ${fmtDate(r.tradeDate)} · ` : ""}
                  {r.updated} stocks updated · {r.snapshots} snapshots
                  {r.message ? ` · ${r.message}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-edge bg-panel p-5">
          <h2 className="font-display text-xl font-bold mb-3">Export — your backup</h2>
          <p className="text-sm text-muted leading-relaxed mb-4">
            The whole league in one file, or a single table as CSV. Downloads are owner-only,
            same as everything on this desk.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export?format=json" className="pill border-groww/60 text-groww hover:bg-panel2">
              Full JSON dump
            </a>
            <a href="/api/export?format=csv&type=positions" className="pill hover:bg-panel2">
              Positions CSV
            </a>
            <a href="/api/export?format=csv&type=claims" className="pill hover:bg-panel2">
              Claims CSV
            </a>
            <a href="/api/export?format=csv&type=snapshots" className="pill hover:bg-panel2">
              Snapshots CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
