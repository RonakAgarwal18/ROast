// Nightly price update — REAL implementation (Round 2).
//
// Downloads the official daily bhavcopy files published by the exchanges,
// feeds them through the shared pipeline in src/lib/prices.ts (the same code
// the /admin CSV upload uses), updates Stock.lastClose / prevClose for the
// whole master, and writes the day's PortfolioSnapshot rows.
//
// Sources (all free, official, one file per exchange per day):
//   NSE equity : https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_<DDMMYYYY>.csv
//   NSE indices: https://nsearchives.nseindia.com/content/indices/ind_close_all_<DDMMYYYY>.csv
//   BSE equity : https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_<YYYYMMDD>_F_0000.csv
//
// Usage:
//   npx tsx scripts/update-prices.ts                 # latest available trading day
//   npx tsx scripts/update-prices.ts --date 2026-11-05
//   npx tsx scripts/update-prices.ts --file ./bhav.csv [--date 2026-11-05]
//
// If the exchange hosts are unreachable from your network this exits 1 with
// the failing URL — use the /admin upload with the same file instead; the
// parsing/applying code path is identical.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseBhavcopyCsv, applyBhavcopy } from "../src/lib/prices";
import { prisma } from "../src/lib/db";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
const yyyymmdd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

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

const secs = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function main() {
  const runStart = Date.now();
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const dateIdx = args.indexOf("--date");
  const dateArg = dateIdx >= 0 ? args[dateIdx + 1] : undefined;

  // --- Local file mode (same pipeline as the /admin upload) ---
  if (fileIdx >= 0) {
    const path = args[fileIdx + 1];
    const text = await readFile(path, "utf8");
    const parsed = parseBhavcopyCsv(text);
    if (parsed.kind === "UNKNOWN") {
      console.error(`Could not recognise the bhavcopy format of ${path}.`);
      process.exit(1);
    }
    const applyT = Date.now();
    const res = await applyBhavcopy(parsed, dateArg);
    console.log(
      `${path}: ${res.kind} file → ${res.updated} stocks updated for ${res.date}, ${res.snapshots} snapshots written. (apply ${secs(applyT)}, total ${secs(runStart)})`
    );
    return;
  }

  // --- Download mode: walk back from the target date to the last trading day ---
  // Leg order matters: BSE applies FIRST and NSE SECOND, because for
  // dual-listed names the NSE close is the canonical one (and a BSE ticker
  // can occasionally collide with a different company's NSE symbol).
  // NSE therefore has the final word; BSE fills the gaps.
  const start = dateArg ? new Date(`${dateArg}T00:00:00`) : new Date();
  let nseApplied = false;

  for (let back = 0; back < 8 && !nseApplied; back++) {
    const day = new Date(start);
    day.setDate(day.getDate() - back);
    const iso = isoOf(day);

    const nseUrl = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(day)}.csv`;
    const nseText = await fetchText(nseUrl);
    if (!nseText) continue; // weekend / holiday / not published yet
    const nseParsed = parseBhavcopyCsv(nseText);
    if (nseParsed.kind === "UNKNOWN" || nseParsed.prices.length === 0) continue;

    // BSE first (best effort) — NSE below overwrites dual-listed names.
    const bseUrl = `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyymmdd(day)}_F_0000.csv`;
    const bseText = await fetchText(bseUrl);
    if (bseText) {
      const bseParsed = parseBhavcopyCsv(bseText);
      if (bseParsed.kind !== "UNKNOWN") {
        const bseT = Date.now();
        const bseRes = await applyBhavcopy(bseParsed, iso);
        console.log(`BSE ${iso}: ${bseRes.updated} stocks updated (gap-fill; NSE overwrites dual-listed). (apply ${secs(bseT)}) (${bseUrl})`);
      }
    } else {
      console.log(`BSE ${iso}: file not reachable — skipped.`);
    }

    const nseT = Date.now();
    const nseRes = await applyBhavcopy(nseParsed, iso);
    console.log(
      `NSE ${iso}: ${nseRes.updated} stocks updated, ${nseRes.snapshots} snapshots written. (apply incl. snapshots ${secs(nseT)}) (${nseUrl})`
    );
    nseApplied = true;

    // NIFTY close for the same day (best effort).
    const idxUrl = `https://nsearchives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy(day)}.csv`;
    const idxText = await fetchText(idxUrl);
    if (idxText) {
      const idxParsed = parseBhavcopyCsv(idxText);
      if (idxParsed.kind === "INDEX" && idxParsed.index.length > 0) {
        const idxRes = await applyBhavcopy(idxParsed, iso);
        console.log(`NIFTY ${iso}: index close updated (${idxRes.updated} row).`);
      }
    } else {
      console.log(`NIFTY ${iso}: index file not reachable — skipped.`);
    }
  }

  console.log(`Done. Total wall-clock: ${secs(runStart)}.`);

  if (!nseApplied) {
    console.error(
      "No NSE bhavcopy could be downloaded for the last 8 days. " +
        "If this network blocks nsearchives.nseindia.com, download the file in a browser " +
        "and use the /admin upload instead — it runs the identical pipeline."
    );
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
