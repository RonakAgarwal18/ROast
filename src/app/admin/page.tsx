import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { uploadBhavcopy, snapshotNow } from "@/lib/actions";
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
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Price updates"
        accent="the referee's desk"
        sub="ROast settles on daily exchange closes. Upload a bhavcopy file and the pipeline updates every known stock, then freezes the day's portfolio snapshots. The nightly script (scripts/update-prices.ts) downloads the same files automatically."
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
            On a server, the same work runs nightly with{" "}
            <code className="text-cream/80">npx tsx scripts/update-prices.ts</code> and the
            master refreshes with{" "}
            <code className="text-cream/80">npx tsx scripts/load-stock-master.ts</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
