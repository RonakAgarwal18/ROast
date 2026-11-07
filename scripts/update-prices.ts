// Nightly price update — REAL implementation (Round 2; shared since Round 5).
//
// Download mode delegates to src/lib/price-run.ts — the same code the
// Vercel cron route and the /admin "Run prices now" button run — which
// downloads the official daily bhavcopy files, feeds them through
// src/lib/prices.ts, updates Stock.lastClose / prevClose for the whole
// master, and writes the day's PortfolioSnapshot rows.
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
// If the exchange hosts are unreachable from your network this exits 1 —
// use the /admin upload with the same file instead; the parsing/applying
// code path is identical.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseBhavcopyCsv, applyBhavcopy } from "../src/lib/prices";
import { runNightlyPrices, recordPriceRun } from "../src/lib/price-run";
import { prisma } from "../src/lib/db";

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
    await recordPriceRun("SCRIPT", {
      status: "OK",
      tradeDate: res.date,
      updated: res.updated,
      snapshots: res.snapshots,
      message: `Local file ${path} (${res.kind})`,
    });
    console.log(
      `${path}: ${res.kind} file → ${res.updated} stocks updated for ${res.date}, ${res.snapshots} snapshots written. (apply ${secs(applyT)}, total ${secs(runStart)})`
    );
    return;
  }

  // --- Download mode: shared with the Vercel cron + /admin "run now" ---
  const summary = await runNightlyPrices("SCRIPT", { dateIso: dateArg });
  console.log(summary.message);
  console.log(`Done. Total wall-clock: ${secs(runStart)}.`);

  if (summary.status !== "OK") {
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
