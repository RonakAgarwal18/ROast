// Correction, on the record: Hanu's first contest book improperly
// revised the original chat picks (Voltas dropped, GLAND/FINCABLES
// copied in after seeing the other AIs' books). Ronak ruled that the
// original picks stand. This rebuild deletes portfolio 12's positions
// and claims and re-books the ORIGINAL five calls in their original
// conviction order, scaled to the full ₹1L. The original SourceText
// stays (receipts are append-only); a correction note is added.
//   npx tsx scripts/rebuild-hanu-contest.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  { symbol: "MMFL", amount: 30000, claim: "Follow-through day: closes up on Mon 9 Nov after Friday's +19.95% upper circuit (Q2 results momentum)" },
  { symbol: "BHEL", amount: 25000, claim: "Closes up 2%+ on Mon 9 Nov on the ₹600–900 cr Power Grid order win; no close below ₹400 during the week" },
  { symbol: "TECHNOE", amount: 20000, claim: "Up 5%+ by Wed 11 Nov close on the pre-results run (Q2 results land Wed 12 Nov)" },
  { symbol: "OLECTRA", amount: 15000, claim: "Moves 10%+ on Mon 9 Nov, its results day — direction follows the print" },
  { symbol: "VOLTAS", amount: 10000, claim: "Closes up on Mon 9 Nov (Q2 PAT +53% YoY, revenue beat)" },
];

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));

  const pf = await sql`SELECT "id", "ownerSourceId" FROM "Portfolio" WHERE "name" = 'Hanu — Mon 9 Nov Day Contest'`;
  if (pf.length === 0) throw new Error("contest portfolio missing");
  const portfolioId = (pf[0] as any).id;
  const sourceId = (pf[0] as any).ownerSourceId;

  const claimIds = await sql`SELECT "id" FROM "Claim" WHERE "portfolioId" = ${portfolioId}`;
  for (const c of claimIds) await sql`DELETE FROM "ClaimItem" WHERE "claimId" = ${(c as any).id}`;
  await sql`DELETE FROM "Claim" WHERE "portfolioId" = ${portfolioId}`;
  await sql`DELETE FROM "Position" WHERE "portfolioId" = ${portfolioId}`;
  console.log(`cleared ${claimIds.length} claims + positions from portfolio ${portfolioId}`);

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"CORRECTION — Hanu contest book rebuilt with the original picks (2026-11-09)"}, ${"The first version of this book dropped Voltas and copied in GLAND and FINCABLES after Hanu had seen the other AIs' books. Ronak ruled that the original picks stand — the only change he had offered was a pity swap on the Nykaa position in the main book, which was declined. This book is therefore rebuilt with Hanu's original five calls from the chat of 2026-11-09 00:44–00:52 IST, in their original conviction order, scaled to the full ₹1,00,000: MMFL ₹30,000, BHEL ₹25,000, TECHNOE ₹20,000, OLECTRA ₹15,000, VOLTAS ₹10,000. The first version's text remains in the record above; receipts are append-only, corrections included."})`;

  for (const pick of PICKS) {
    const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = ${pick.symbol}`;
    if (st.length === 0) throw new Error(`stock not in master: ${pick.symbol}`);
    const { id: stockId, lastClose, name } = st[0] as any;
    const pos = await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
      VALUES (${portfolioId}, ${stockId}, ${pick.amount / lastClose}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', ${pick.amount}, 'MON 9 NOV · OPEN→CLOSE')
      RETURNING "id"`;
    const cl = await sql`
      INSERT INTO "Claim" ("sourceId", "stockId", "portfolioId", "claimText", "quoteSentence", "dueDate")
      VALUES (${sourceId}, ${stockId}, ${portfolioId}, ${pick.claim}, ${pick.claim}, '2026-11-09T00:00:00.000Z') RETURNING "id"`;
    await sql`INSERT INTO "ClaimItem" ("claimId", "label", "state") VALUES (${(cl[0] as any).id}, 'Moves as claimed, open to close, on 9 Nov', 'PENDING')`;
    console.log(`${pick.symbol} (${name}): ₹${pick.amount} re-booked, pos ${(pos[0] as any).id}, claim ${(cl[0] as any).id}`);
  }
  console.log(`Hanu contest portfolio ${portfolioId} rebuilt — original five picks, ₹1,00,000, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
