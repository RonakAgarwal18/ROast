// The nightly price run, shared by every door that fetches prices
// itself: the Vercel cron route, the /admin "Run prices now" action and
// the CLI script (scripts/update-prices.ts). The /admin bhavcopy upload
// stays a separate door (it applies a user-supplied file), but records
// its runs in the same PriceRun table.
//
// Behaviour mirrors the original Round-2 script: walk back up to 8 days
// from today (IST) to the latest published trading day; apply BSE first
// (gap-fill), then NSE (canonical for dual-listed names), then the NSE
// index file for the NIFTY close — all through src/lib/prices.ts.

import { prisma } from "./db";
import { parseBhavcopyCsv, applyBhavcopy, dayDate } from "./prices";
import { NAVALL_URL, parseNavAll, refreshFundMaster, applyFundNavs } from "./funds";
import { recordMoverHeadlines } from "./movers";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
const yyyymmdd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Today's date in India, as a local-midnight Date (IST is the market's clock). */
export function todayIST(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 100 ? text : null;
  } catch {
    return null;
  }
}

export type PriceRunSource = "CRON" | "ADMIN" | "ADMIN_UPLOAD" | "SCRIPT";

export type PriceRunSummary = {
  status: "OK" | "NO_FILE" | "ERROR";
  tradeDate: string | null;
  updated: number;
  snapshots: number;
  message: string;
};

/** Record a finished run (any door) in the PriceRun table. */
export async function recordPriceRun(
  source: PriceRunSource,
  summary: PriceRunSummary
): Promise<void> {
  await prisma.priceRun.create({
    data: {
      source,
      status: summary.status,
      tradeDate: summary.tradeDate ? dayDate(summary.tradeDate) : null,
      updated: summary.updated,
      snapshots: summary.snapshots,
      message: summary.message.slice(0, 900),
    },
  });
}

/**
 * Download the latest available bhavcopy files and apply them.
 * Idempotent: re-running for a day already on record rewrites the same
 * closes and snapshots. Records the run unless `record` is false.
 */
export async function runNightlyPrices(
  source: PriceRunSource,
  opts: { dateIso?: string; record?: boolean } = {}
): Promise<PriceRunSummary> {
  const notes: string[] = [];
  let updated = 0;
  let snapshots = 0;
  let tradeDate: string | null = null;

  try {
    const start = opts.dateIso ? dayDate(opts.dateIso) : todayIST();
    let nseApplied = false;

    for (let back = 0; back < 8 && !nseApplied; back++) {
      const day = new Date(start);
      day.setDate(day.getDate() - back);
      const iso = isoOf(day);

      const nseText = await fetchText(
        `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(day)}.csv`
      );
      if (!nseText) continue; // weekend / holiday / not published yet
      const nseParsed = parseBhavcopyCsv(nseText);
      if (nseParsed.kind === "UNKNOWN" || nseParsed.prices.length === 0) continue;

      // BSE first (best effort) — NSE below overwrites dual-listed names.
      const bseText = await fetchText(
        `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyymmdd(day)}_F_0000.csv`
      );
      if (bseText) {
        const bseParsed = parseBhavcopyCsv(bseText);
        if (bseParsed.kind !== "UNKNOWN") {
          const bseRes = await applyBhavcopy(bseParsed, iso);
          updated += bseRes.updated;
          notes.push(`BSE ${iso}: ${bseRes.updated} updated`);
        }
      } else {
        notes.push(`BSE ${iso}: file unreachable, skipped`);
      }

      const nseRes = await applyBhavcopy(nseParsed, iso);
      updated += nseRes.updated;
      snapshots += nseRes.snapshots;
      tradeDate = iso;
      nseApplied = true;
      notes.push(`NSE ${iso}: ${nseRes.updated} updated, ${nseRes.snapshots} snapshots`);

      // NIFTY close for the same day (best effort).
      const idxText = await fetchText(
        `https://nsearchives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy(day)}.csv`
      );
      if (idxText) {
        const idxParsed = parseBhavcopyCsv(idxText);
        if (idxParsed.kind === "INDEX" && idxParsed.index.length > 0) {
          await applyBhavcopy(idxParsed, iso);
          notes.push(`NIFTY ${iso}: index close updated`);
        }
      } else {
        notes.push(`NIFTY ${iso}: index file unreachable, skipped`);
      }
    }

    // Mutual funds (Round 7, best effort): refresh the AMFI master and
    // apply fresh NAVs to any fund benchmarks in the league. A failure
    // here never fails the equity run.
    try {
      const navText = await fetchText(NAVALL_URL);
      if (navText) {
        const fundRows = parseNavAll(navText);
        if (fundRows.length > 1000) {
          const master = await refreshFundMaster(fundRows);
          const applied = await applyFundNavs(fundRows);
          notes.push(
            `Funds: master ${master} schemes, ${applied.updated} league NAVs${
              applied.navDate ? ` @ ${applied.navDate}` : ""
            }`
          );
          snapshots += applied.snapshots;
        } else {
          notes.push("Funds: NAV file parsed too few rows, skipped");
        }
      } else {
        notes.push("Funds: NAV file unreachable, skipped");
      }
    } catch (e) {
      notes.push(
        `Funds step failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
      );
    }

    // Daily Movers news context (best effort): store the headlines that
    // ran around the day's biggest moves, shown as possible context —
    // never as a verified cause.
    if (tradeDate) {
      try {
        const withNews = await recordMoverHeadlines(tradeDate);
        if (withNews > 0) notes.push(`Movers: news context stored for ${withNews} stocks`);
      } catch (e) {
        notes.push(
          `Movers news step failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
        );
      }
    }

    const summary: PriceRunSummary = nseApplied
      ? { status: "OK", tradeDate, updated, snapshots, message: notes.join(" · ") }
      : {
          status: "NO_FILE",
          tradeDate: null,
          updated: 0,
          snapshots: 0,
          message: "No NSE bhavcopy found in the last 8 days (long holiday stretch, or the exchange host is unreachable).",
        };
    if (opts.record !== false) await recordPriceRun(source, summary);
    return summary;
  } catch (e) {
    const summary: PriceRunSummary = {
      status: "ERROR",
      tradeDate,
      updated,
      snapshots,
      message: `Run failed: ${
        e instanceof Error ? e.message : JSON.stringify(e) ?? String(e)
      }`.slice(0, 900),
    };
    try {
      if (opts.record !== false) await recordPriceRun(source, summary);
    } catch {
      // Recording the failure must not mask the original error.
    }
    return summary;
  }
}
