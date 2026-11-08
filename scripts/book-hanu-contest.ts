// Hanu's pure Mon 9 Nov day-contest portfolio (separate from the main
// Hanu book, whose Nykaa position + 19 Nov claim stay untouched):
// ₹1L fully invested, NEXT_OPEN fills + DAY_CLOSE auto-sells.
// Voltas drops out (thinnest case); GLAND joins (the unpriced beat).
//   npx tsx scripts/book-hanu-contest.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  { symbol: "MMFL", amount: 25000, claim: "Follow-through day: closes up on Mon 9 Nov after Friday's +19.95% upper circuit (Q2 results momentum)" },
  { symbol: "GLAND", amount: 20000, claim: "Closes up 4%+ open-to-close on Mon 9 Nov — Friday's Q2 beat (PAT +58%) fell 1.16% in the thin Muhurat session and gets its first full session" },
  { symbol: "BHEL", amount: 20000, claim: "Closes up on Mon 9 Nov on the ₹600–900 cr Power Grid order win" },
  { symbol: "FINCABLES", amount: 15000, claim: "Closes up open-to-close on Mon 9 Nov (Q2 blowout + Muhurat upper-circuit momentum); sized mid because the open may gap away" },
  { symbol: "OLECTRA", amount: 10000, claim: "Moves 10%+ on Mon 9 Nov, its results day — direction follows the print" },
  { symbol: "TECHNOE", amount: 10000, claim: "Closes up on Mon 9 Nov as pre-results positioning starts ahead of the Wed 12 Nov print" },
];

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));

  const owner = await sql`SELECT "ownerSourceId" FROM "Portfolio" WHERE "id" = 5`;
  if (owner.length === 0) throw new Error("Hanu portfolio 5 missing");
  const sourceId = (owner[0] as any).ownerSourceId;

  const existing = await sql`SELECT "id" FROM "Portfolio" WHERE "name" = 'Hanu — Mon 9 Nov Day Contest'`;
  if (existing.length > 0) throw new Error("contest portfolio already exists: " + (existing[0] as any).id);

  const pf = await sql`
    INSERT INTO "Portfolio" ("name", "ownerSourceId", "startingCash", "cash", "isReal")
    VALUES ('Hanu — Mon 9 Nov Day Contest', ${sourceId}, 100000, 0, false) RETURNING "id"`;
  const portfolioId = (pf[0] as any).id;

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"Hanu — Mon 9 Nov day contest book (chat, 2026-11-09)"}, ${"Hanu's pure one-day contest book for Mon 9 Nov 2026, separate from the main Hanu portfolio: the Nykaa position there stays untouched — it carries a live claim due 19 Nov and stands or falls on that date. This book: MMFL ₹25,000 (results-momentum follow-through), GLAND ₹20,000 (the unpriced Q2 beat), BHEL ₹20,000 (Power Grid order win), FINCABLES ₹15,000 (consensus momentum, sized mid for gap risk), OLECTRA ₹10,000 (results-day binary), TECHNOE ₹10,000 (pre-results run). Voltas from the earlier chat picks drops out — thinnest case of the five. All fill at Monday's open (whole shares), all sell at Monday's close."})`;

  for (const pick of PICKS) {
    const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = ${pick.symbol}`;
    if (st.length === 0) throw new Error(`stock not in master: ${pick.symbol}`);
    const { id: stockId, lastClose, name } = st[0] as any;
    if (!lastClose) throw new Error(`no lastClose for ${pick.symbol}`);
    const pos = await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
      VALUES (${portfolioId}, ${stockId}, ${pick.amount / lastClose}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', ${pick.amount}, 'MON 9 NOV · OPEN→CLOSE')
      RETURNING "id"`;
    const cl = await sql`
      INSERT INTO "Claim" ("sourceId", "stockId", "portfolioId", "claimText", "quoteSentence", "dueDate")
      VALUES (${sourceId}, ${stockId}, ${portfolioId}, ${pick.claim}, ${pick.claim}, '2026-11-09T00:00:00.000Z') RETURNING "id"`;
    await sql`INSERT INTO "ClaimItem" ("claimId", "label", "state") VALUES (${(cl[0] as any).id}, 'Moves as claimed, open to close, on 9 Nov', 'PENDING')`;
    console.log(`${pick.symbol} (${name}): ₹${pick.amount} booked, pos ${(pos[0] as any).id}, claim ${(cl[0] as any).id}`);
  }
  console.log(`Hanu contest portfolio id ${portfolioId} — ₹1,00,000 fully invested, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
