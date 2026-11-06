// Full stock master loader — REAL implementation (Round 2).
//
// Loads the official listed-company lists into the Stock table so search,
// the Add Analysis parser and manual entry work for ANY listed stock:
//
//   NSE: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
//        (SYMBOL, NAME OF COMPANY, SERIES — EQ and BE series are loaded)
//   BSE: the latest daily BSE bhavcopy doubles as the security list
//        (TckrSymb + FinInstrmNm for FinInstrmTp = STK). BSE only adds
//        symbols NSE doesn't have; BSE's names are truncated in that file,
//        which is why NSE runs first and wins.
//
// Existing rows are NEVER overwritten: seeded names and every recorded
// close survive a master refresh. New rows start with lastClose = null
// and display "—" until the price pipeline prices them.
//
// Usage: npx tsx scripts/load-stock-master.ts

import "dotenv/config";
import { parseCsv } from "../src/lib/prices";
import { prisma } from "../src/lib/db";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const pad = (n: number) => String(n).padStart(2, "0");

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

async function upsertNew(
  rows: Array<{ symbol: string; name: string; exchange: string }>
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const symbol = r.symbol.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const existing = await prisma.stock.findUnique({ where: { symbol } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.stock.create({
      data: { symbol, name: r.name.trim(), exchange: r.exchange, lastClose: null, closeDate: null },
    });
    added++;
  }
  return { added, skipped };
}

async function main() {
  // --- NSE equity list ---
  const nseUrl = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
  const nseText = await fetchText(nseUrl);
  if (!nseText) {
    console.error(`Could not download the NSE equity list (${nseUrl}). Nothing loaded.`);
    process.exit(1);
  }
  const nseRows = parseCsv(nseText)
    .filter((r) => ["EQ", "BE"].includes((r["SERIES"] ?? "").toUpperCase()))
    .map((r) => ({
      symbol: r["SYMBOL"] ?? "",
      name: r["NAME OF COMPANY"] ?? "",
      exchange: "NSE",
    }))
    .filter((r) => r.symbol && r.name);
  const nse = await upsertNew(nseRows);
  console.log(`NSE: ${nseRows.length} listed equities → ${nse.added} new, ${nse.skipped} already present.`);

  // --- BSE security list (latest bhavcopy, best effort) ---
  let bseLoaded = false;
  for (let back = 0; back < 8 && !bseLoaded; back++) {
    const day = new Date();
    day.setDate(day.getDate() - back);
    const url = `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}_F_0000.csv`;
    const text = await fetchText(url);
    if (!text) continue;
    const rows = parseCsv(text)
      .filter((r) => r["FININSTRMTP"] === "STK" && r["SGMT"] === "CM")
      .map((r) => ({
        symbol: r["TCKRSYMB"] ?? "",
        name: r["FININSTRMNM"] ?? "",
        exchange: "BSE",
      }))
      .filter((r) => r.symbol && r.name);
    if (rows.length === 0) continue;
    const bse = await upsertNew(rows);
    console.log(`BSE: ${rows.length} securities → ${bse.added} new (BSE-only), ${bse.skipped} already present.`);
    bseLoaded = true;
  }
  if (!bseLoaded) console.log("BSE: no bhavcopy reachable in the last 8 days — NSE master loaded only.");

  const total = await prisma.stock.count();
  const priced = await prisma.stock.count({ where: { lastClose: { not: null } } });
  console.log(`Stock master now holds ${total} symbols (${priced} with a recorded close).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
