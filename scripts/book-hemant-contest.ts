// Hemant's Mon 9 Nov picks, equal weight (₹20,000 each of the ₹1L
// book), NEXT_OPEN → DAY_CLOSE day orders, in the portfolio Ronak
// created for him (id 13). Spinaroo Commercial is checked explicitly
// first; if it is not in the exchange master it is NOT booked and its
// ₹20,000 stays as cash pending Ronak's call.
//   npx tsx scripts/book-hemant-contest.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = ["TATACAP", "JPL", "MONEYVIEW", "HDFCBANK"];
const EACH = 20000;

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));

  const spin = await sql`SELECT "symbol", "name" FROM "Stock" WHERE "symbol" ILIKE '%spinaroo%' OR "name" ILIKE '%spinaroo%'`;
  console.log("Spinaroo in master:", JSON.stringify(spin));

  const pf = await sql`SELECT "id", "ownerSourceId", "cash" FROM "Portfolio" WHERE "id" = 13`;
  if (pf.length === 0) throw new Error("Hemant portfolio 13 missing");
  const sourceId = (pf[0] as any).ownerSourceId;
  const dupe = await sql`SELECT "id" FROM "Position" WHERE "portfolioId" = 13 AND "entryMode" = 'NEXT_OPEN'`;
  if (dupe.length > 0) throw new Error("day orders already booked for Hemant");

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"Hemant's picks for Mon 9 Nov (via Ronak, 2026-11-09)"}, ${"Hemant's five picks for Monday 9 November 2026, passed on by Ronak: Tata Capital, Jio Platforms, Moneyview, HDFC Bank, Spinaroo Commercial — equal weight, ₹20,000 each of the ₹1,00,000 book, fill at Monday's open, sell at Monday's close. No reasoning or expected-move claims were stated for any pick."})`;

  let booked = 0;
  for (const symbol of PICKS) {
    const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = ${symbol}`;
    if (st.length === 0) throw new Error(`stock not in master: ${symbol}`);
    const { id: stockId, lastClose, name } = st[0] as any;
    const pos = await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
      VALUES (13, ${stockId}, ${EACH / lastClose}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', ${EACH}, 'MON 9 NOV · OPEN→CLOSE')
      RETURNING "id"`;
    console.log(`${symbol} (${name}): ₹${EACH} booked, pos ${(pos[0] as any).id}`);
    booked += EACH;
  }
  await sql`UPDATE "Portfolio" SET "cash" = ${100000 - booked} WHERE "id" = 13`;
  console.log(`Hemant: ₹${booked} deployed across ${PICKS.length} picks, ₹${100000 - booked} cash left`);
}
main().catch((e) => { console.error(e); process.exit(1); });
