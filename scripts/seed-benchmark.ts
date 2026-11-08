// Seed the first league benchmark (UTI Nifty 50 Index, Direct Growth,
// ₹1,00,000) exactly the way the addFundBenchmark action does it —
// via the Neon HTTP driver, since Prisma can't connect from this VM.
//   npx tsx scripts/seed-benchmark.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const direct = (process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer");
  const sql = neon(direct);

  const schemeRows = await sql`SELECT * FROM "FundScheme" WHERE "schemeCode" = '120716'`;
  if (schemeRows.length === 0) throw new Error("scheme 120716 not in master");
  const scheme: any = schemeRows[0];
  const nav: number = scheme.nav;
  const display = `${scheme.name} · Direct Growth`;
  const symbol = `MF${scheme.schemeCode}`;
  const navStamp = `2026-11-06T00:00:00.000Z`;
  console.log("scheme:", display, "NAV", nav);

  const stockRows = await sql`
    INSERT INTO "Stock" ("symbol", "name", "exchange", "lastClose", "prevClose", "closeDate")
    VALUES (${symbol}, ${display}, 'MF', ${nav}, NULL, ${navStamp})
    ON CONFLICT ("symbol") DO UPDATE SET "lastClose" = EXCLUDED."lastClose", "closeDate" = EXCLUDED."closeDate"
    RETURNING "id"`;
  const stockId = stockRows[0].id;

  // NAV history from mfapi.in (AMFI mirror), most recent 400 days.
  const res = await fetch(`https://api.mfapi.in/mf/${scheme.schemeCode}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`mfapi ${res.status}`);
  const json: any = await res.json();
  const hist = (json.data ?? []).slice(0, 400) as Array<{ date: string; nav: string }>;
  let inserted = 0;
  for (let i = 0; i < hist.length; i += 400) {
    const slice = hist.slice(i, i + 400);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of slice) {
      const m = r.date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const v = parseFloat(r.nav);
      if (!m || isNaN(v)) continue;
      params.push(stockId, `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`, v);
      const b = params.length - 3;
      tuples.push(`($${b + 1},$${b + 2},$${b + 3})`);
    }
    if (tuples.length === 0) continue;
    await sql.query(
      `INSERT INTO "StockClose" ("stockId","date","close") VALUES ${tuples.join(",")}
       ON CONFLICT ("stockId","date") DO UPDATE SET "close" = EXCLUDED."close"`,
      params
    );
    inserted += tuples.length;
  }
  console.log(`history: ${inserted} NAV days recorded`);

  const srcRows = await sql`
    INSERT INTO "Source" ("name", "kind") VALUES ('Benchmarks', 'BENCHMARK')
    ON CONFLICT ("name") DO UPDATE SET "kind" = EXCLUDED."kind" RETURNING "id"`;
  const sourceId = srcRows[0].id;

  const pfName = `${display} — Benchmark`;
  const cash = 100000;
  const pfRows = await sql`
    INSERT INTO "Portfolio" ("name", "ownerSourceId", "isReal", "startingCash", "cash", "sizingRule")
    VALUES (${pfName}, ${sourceId}, false, ${cash}, 0, 'FIXED')
    ON CONFLICT ("name") DO NOTHING RETURNING "id"`;
  let portfolioId: number;
  if (pfRows.length > 0) {
    portfolioId = pfRows[0].id;
    const units = cash / nav;
    await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "tag")
      VALUES (${portfolioId}, ${stockId}, ${units}, ${nav}, ${navStamp}, 'OPEN', 'BENCHMARK')`;
    console.log(`portfolio ${portfolioId} created with ${units.toFixed(4)} units @ ${nav}`);
  } else {
    const ex = await sql`SELECT "id" FROM "Portfolio" WHERE "name" = ${pfName}`;
    portfolioId = ex[0].id;
    console.log(`portfolio already exists (${portfolioId}) — position/snapshot left as-is`);
  }

  await sql`
    INSERT INTO "PortfolioSnapshot" ("portfolioId", "date", "totalValue", "returnPct", "niftyClose")
    VALUES (${portfolioId}, ${navStamp}, ${cash}, 0, 25030.35)
    ON CONFLICT ("portfolioId", "date") DO NOTHING`;
  console.log("snapshot frozen for 2026-11-06 at ₹1,00,000 (0.00%)");
}
main().catch((e) => { console.error(e); process.exit(1); });
