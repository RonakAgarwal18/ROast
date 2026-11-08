// Whole-shares normalization: Indian equities cannot be held in
// fractions. Every OPEN equity position is floored to whole shares;
// the fractional remainder (valued at its entry price) returns to the
// portfolio's cash — exactly as if only full shares had ever been
// bought. Unfilled NEXT_OPEN contest orders are display-only (the
// settlement owns their money), and mutual funds keep fractional
// units, which are real. CLOSED positions are history and stay.
//   npx tsx scripts/normalize-whole-units.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));

  const rows = await sql`
    SELECT p."id", p."portfolioId", p."units"::float, p."entryPrice"::float, p."entryMode",
           s."symbol", s."exchange", pf."isReal", pf."name" AS pfname
    FROM "Position" p
    JOIN "Stock" s ON s."id" = p."stockId"
    JOIN "Portfolio" pf ON pf."id" = p."portfolioId"
    WHERE p."status" = 'OPEN' AND s."exchange" <> 'MF' AND p."units" <> floor(p."units")`;
  console.log(`${rows.length} fractional OPEN equity positions found`);

  const cashBack = new Map<number, number>();
  for (const r of rows as any[]) {
    const whole = Math.floor(r.units);
    const frac = r.units - whole;
    if (whole < 1) {
      await sql`DELETE FROM "Position" WHERE "id" = ${r.id}`;
      if (r.entryMode !== "NEXT_OPEN" && !r.isReal) {
        cashBack.set(r.portfolioId, (cashBack.get(r.portfolioId) ?? 0) + r.units * r.entryPrice);
      }
      console.log(`#${r.id} ${r.symbol} (${r.pfname}): ${r.units} units < 1 share — removed, value back to cash`);
      continue;
    }
    await sql`UPDATE "Position" SET "units" = ${whole} WHERE "id" = ${r.id}`;
    if (r.entryMode !== "NEXT_OPEN" && !r.isReal) {
      cashBack.set(r.portfolioId, (cashBack.get(r.portfolioId) ?? 0) + frac * r.entryPrice);
    }
    console.log(`#${r.id} ${r.symbol} (${r.pfname}): ${r.units} → ${whole} shares`);
  }
  for (const [pfId, amt] of cashBack) {
    if (amt <= 0) continue;
    const u = await sql`UPDATE "Portfolio" SET "cash" = "cash" + ${amt} WHERE "id" = ${pfId} RETURNING "name", "cash"::float`;
    console.log(`portfolio ${(u[0] as any).name}: +₹${amt.toFixed(2)} fractional remainder returned to cash (cash now ₹${(u[0] as any).cash.toFixed(2)})`);
  }
  console.log("normalization done");
}
main().catch((e) => { console.error(e); process.exit(1); });
