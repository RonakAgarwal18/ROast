// Refresh the display share estimates of unfilled NEXT_OPEN orders to
// the nearestShares rule (display only — the real fill uses Monday's
// open). Run after the formula change so books show ~full deployment.
//   npx tsx scripts/refresh-unfilled-estimates.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";
import { nearestShares } from "../src/lib/shares";
async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));
  const rows = await sql`
    SELECT p."id", p."plannedAmount"::float, p."units"::float, s."symbol", s."lastClose"::float, pf."name" AS pf
    FROM "Position" p JOIN "Stock" s ON s."id" = p."stockId" JOIN "Portfolio" pf ON pf."id" = p."portfolioId"
    WHERE p."status" = 'OPEN' AND p."entryMode" = 'NEXT_OPEN'`;
  const totals = new Map<string, number>();
  for (const r of rows as any[]) {
    if (!r.plannedAmount || !r.lastClose) continue;
    const est = nearestShares(r.plannedAmount, r.lastClose);
    if (est !== r.units) {
      await sql`UPDATE "Position" SET "units" = ${est} WHERE "id" = ${r.id}`;
    }
    totals.set(r.pf, (totals.get(r.pf) ?? 0) + est * r.lastClose);
    console.log(`${r.pf} · ${r.symbol}: ₹${r.plannedAmount} → est ${est} sh (~₹${Math.round(est * r.lastClose)})`);
  }
  for (const [pf, total] of totals) console.log(`ESTIMATED DEPLOYMENT ${pf}: ~₹${Math.round(total)} of ₹1,00,000`);
}
main().catch((e) => { console.error(e); process.exit(1); });
