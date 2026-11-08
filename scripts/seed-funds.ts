// Seed/refresh the FundScheme master from AMFI's NAVAll file.
// Local runs use the Neon HTTP driver (Prisma can't connect from this
// VM); the same parseNavAll powers the nightly cron path on Vercel.
//   npx tsx scripts/seed-funds.ts [path-to-NAVAll.txt]
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
  const { parseNavAll } = await import("../src/lib/funds");

  let text: string;
  const path = process.argv[2];
  if (path) {
    text = fs.readFileSync(path, "utf8");
  } else {
    const res = await fetch("https://portal.amfiindia.com/spages/NAVAll.txt", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`NAVAll fetch ${res.status}`);
    text = await res.text();
  }
  const rows = parseNavAll(text);
  console.log(`parsed ${rows.length} scheme rows`);
  let done = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const slice = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const tuples = slice.map((r, j) => {
      params.push(
        r.schemeCode, r.isin, r.name, r.plan, r.option, r.amc, r.category,
        r.nav, r.dateIso ? `${r.dateIso}T00:00:00.000Z` : null
      );
      const b = j * 9;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
    });
    await sql.query(
      `INSERT INTO "FundScheme" ("schemeCode","isin","name","plan","option","amc","category","nav","navDate")
       VALUES ${tuples.join(",")}
       ON CONFLICT ("schemeCode") DO UPDATE SET
         "isin"=EXCLUDED."isin","name"=EXCLUDED."name","plan"=EXCLUDED."plan","option"=EXCLUDED."option",
         "amc"=EXCLUDED."amc","category"=EXCLUDED."category","nav"=EXCLUDED."nav","navDate"=EXCLUDED."navDate",
         "updatedAt"=NOW()`,
      params
    );
    done += slice.length;
  }
  const cnt = await sql`SELECT COUNT(*)::int AS n FROM "FundScheme"`;
  console.log(`upserted ${done}; master now holds ${cnt[0].n} schemes`);
  const picks = await sql`
    SELECT "schemeCode", "name", "plan", "option", "nav", "navDate"::text AS nd FROM "FundScheme"
    WHERE ("name" ILIKE '%Nifty 50 Index%' OR "name" ILIKE '%Parag Parikh Flexi%')
      AND "plan" = 'Direct Plan' AND "option" = 'Growth Option'
    ORDER BY "name" LIMIT 8`;
  for (const r of picks) console.log("PICK:", r.schemeCode, r.name, "NAV", r.nav, "@", r.nd);
}
main().catch((e) => { console.error(e); process.exit(1); });
