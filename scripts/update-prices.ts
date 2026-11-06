// Nightly bhavcopy ingest — STUB (see scripts/prices.README.md for the design).
//
// Steps to implement:
//   1. Download NSE equity bhavcopy (cm<DDMMMYYYY>bhav.csv.zip) and the BSE
//      equity bhavcopy for the last trading day.
//   2. Unzip + parse CSVs: SYMBOL / CLOSE columns (NSE), SC_NAME / CLOSE (BSE).
//   3. For every Stock row, update lastClose + closeDate.
//   4. Also update the NIFTY row (exchange = "INDEX") from the index close.
//   5. (v1.1) Write PortfolioSnapshot rows and recompute source scores.
//
// Until this is wired, the app runs on seeded closes and the My Desk
// quick-update box. Run with: npx tsx scripts/update-prices.ts

async function main() {
  console.log("bhavcopy ingest is a stub in v1 — see scripts/prices.README.md");
  console.log("Would: download NSE+BSE bhavcopy → update Stock.lastClose for the whole master.");
}

main();
