// Backfill MoverHeadline rows for one trading day (the nightly run does
// this going forward). Movers are computed from StockClose in SQL here;
// the fetching reuses the app's own fetchCompanyHeadlines.
//   npx tsx scripts/backfill-mover-headlines.ts 2026-11-06
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const dateIso = process.argv[2] ?? "2026-11-06";
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const direct = (process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer");
  const sql = neon(direct);
  const { fetchCompanyHeadlines } = await import("../src/lib/headlines");

  const movers = await sql`
    WITH days AS (
      SELECT DISTINCT "date" FROM "StockClose" WHERE "date" <= ${dateIso}::date ORDER BY "date" DESC LIMIT 2
    ),
    pair AS (
      SELECT c."stockId",
             MAX(c."close") FILTER (WHERE c."date" = (SELECT MAX("date") FROM days)) AS cur,
             MAX(c."close") FILTER (WHERE c."date" = (SELECT MIN("date") FROM days)) AS prev
      FROM "StockClose" c WHERE c."date" IN (SELECT "date" FROM days) GROUP BY c."stockId"
    )
    SELECT s."symbol", s."name", p.cur, p.prev, (p.cur - p.prev) / p.prev * 100 AS change
    FROM pair p JOIN "Stock" s ON s."id" = p."stockId"
    WHERE p.prev > 0 AND p.cur >= 5
    ORDER BY ABS((p.cur - p.prev) / p.prev) DESC LIMIT 20`;
  console.log(`top movers for ${dateIso}: ${movers.length}`);

  const day = new Date(`${dateIso}T00:00:00.000Z`);
  const from = new Date(day); from.setDate(from.getDate() - 4);
  const to = new Date(day); to.setDate(to.getDate() + 2);
  let stored = 0;
  for (const m of movers as any[]) {
    const headlines = await fetchCompanyHeadlines(m.name, from, to, 3);
    if (headlines.length === 0) {
      console.log(`${m.symbol}: no headlines in window`);
      continue;
    }
    for (const h of headlines) {
      await sql`
        INSERT INTO "MoverHeadline" ("date", "symbol", "title", "url", "source", "publishedAt")
        VALUES (${`${dateIso}T00:00:00.000Z`}, ${m.symbol}, ${h.title}, ${h.url}, ${h.source}, ${h.publishedAt?.toISOString() ?? null})
        ON CONFLICT ("date", "symbol", "title") DO NOTHING`;
    }
    stored++;
    console.log(`${m.symbol} (${Number(m.change).toFixed(1)}%): ${headlines.length} headlines — e.g. "${headlines[0].title}"`);
  }
  const cnt = await sql`SELECT COUNT(*)::int AS n FROM "MoverHeadline" WHERE "date" = ${`${dateIso}T00:00:00.000Z`}`;
  console.log(`DONE: headlines stored for ${stored} stocks; table rows for ${dateIso}: ${cnt[0].n}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
