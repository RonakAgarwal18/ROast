// Final shape of Hanu's contest book, per Ronak's clarified ruling:
// the original five picks at their ORIGINAL sizes (₹90,000), plus ONE
// new ₹10,000 pick he explicitly permitted for the Nykaa slot — GLAND,
// the unpriced beat Hanu had already named the cleanest name on the
// board in the combined summary. TECHNOE's claim keeps its 11 Nov due
// date (the original call); everything else is judged on 9 Nov.
//   npx tsx scripts/rebuild-hanu-contest-v2.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  { symbol: "MMFL", amount: 25000, due: "2026-11-09", claim: "Follow-through day: closes up on Mon 9 Nov after Friday's +19.95% upper circuit (Q2 results momentum)" },
  { symbol: "BHEL", amount: 20000, due: "2026-11-09", claim: "Closes up 2%+ on Mon 9 Nov on the ₹600–900 cr Power Grid order win; no close below ₹400 during the week" },
  { symbol: "TECHNOE", amount: 17500, due: "2026-11-11", claim: "Up 5%+ by Wed 11 Nov close on the pre-results run (Q2 results land Wed 12 Nov)" },
  { symbol: "OLECTRA", amount: 15000, due: "2026-11-09", claim: "Moves 10%+ on Mon 9 Nov, its results day — direction follows the print" },
  { symbol: "VOLTAS", amount: 12500, due: "2026-11-09", claim: "Closes up on Mon 9 Nov (Q2 PAT +53% YoY, revenue beat)" },
  { symbol: "GLAND", amount: 10000, due: "2026-11-09", claim: "Closes up 4%+ open-to-close on Mon 9 Nov — Friday's Q2 beat (PAT +58% to ₹291 cr) fell 1.16% in the thin Muhurat session and gets its first full session. The one new pick Ronak permitted for the Nykaa slot" },
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

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"FINAL SHAPE — original five at original sizes + one permitted new pick (2026-11-09)"}, ${"Ronak clarified the permission: the original five picks stay at their original sizes (MMFL ₹25,000, BHEL ₹20,000, TECHNOE ₹17,500, OLECTRA ₹15,000, VOLTAS ₹12,500 = ₹90,000), and the remaining ₹10,000 — the slot Nykaa occupies in the main book — may go to ONE new stock not picked before. Hanu's new pick: GLAND at ₹10,000, the unpriced Q2 beat he had already named the cleanest name on the board in the combined summary. Total ₹1,00,000, fully invested."})`;

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
      VALUES (${sourceId}, ${stockId}, ${portfolioId}, ${pick.claim}, ${pick.claim}, ${pick.due + "T00:00:00.000Z"}) RETURNING "id"`;
    await sql`INSERT INTO "ClaimItem" ("claimId", "label", "state") VALUES (${(cl[0] as any).id}, 'Moves as claimed, open to close, on 9 Nov', 'PENDING')`;
    console.log(`${pick.symbol} (${name}): ₹${pick.amount} booked, pos ${(pos[0] as any).id}, claim ${(cl[0] as any).id}`);
  }
  console.log(`Hanu contest portfolio ${portfolioId} final: original five (₹90k) + GLAND ₹10k = ₹1,00,000, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
