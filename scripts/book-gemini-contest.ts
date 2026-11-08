// Book Gemini's Mon 9 Nov day-contest portfolio from its super-prompt
// reply: ₹1L fully invested, NEXT_OPEN fills + DAY_CLOSE auto-sells,
// one claim per pick from its own expected-move sentence, full text
// stored verbatim as the receipt.
//   npx tsx scripts/book-gemini-contest.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  { symbol: "GESHIP", amount: 30000, claim: "9–14% open-to-close expansion on Mon 9 Nov (delayed post-earnings re-rating + dividend rush as institutions return)" },
  { symbol: "SIGMAADV", amount: 25000, claim: "11–16% intraday surge toward upper circuit on Mon 9 Nov as institutions digest the order book" },
  { symbol: "GLAND", amount: 20000, claim: "8–12% open-to-close rally on Mon 9 Nov (mean reversion + breakout above ₹3,208.60 52W high)" },
  { symbol: "DYNAMATECH", amount: 15000, claim: "10–15% squeeze higher from the opening print on Mon 9 Nov (tight float + defence-pack beta)" },
  { symbol: "OLECTRA", amount: 10000, claim: "10–15% single-day move — results-day spike Mon 9 Nov or post-holiday follow-through (short-covering breakout above 50-DMA ₹1,107.70)" },
];

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));
  const body = fs.readFileSync("/tmp/contest/gemini.txt", "utf8");

  const src = await sql`SELECT "id" FROM "Source" WHERE "name" = 'Gemini'`;
  if (src.length === 0) throw new Error("Gemini source missing");
  const sourceId = (src[0] as any).id;

  const existing = await sql`SELECT "id" FROM "Portfolio" WHERE "name" = 'Gemini — Mon 9 Nov Day Contest'`;
  if (existing.length > 0) throw new Error("contest portfolio already exists: " + (existing[0] as any).id);

  const pf = await sql`
    INSERT INTO "Portfolio" ("name", "ownerSourceId", "startingCash", "cash", "isReal")
    VALUES ('Gemini — Mon 9 Nov Day Contest', ${sourceId}, 100000, 0, false) RETURNING "id"`;
  const portfolioId = (pf[0] as any).id;

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"Gemini — super-prompt reply, Mon 9 Nov day contest (pasted 2026-11-09)"}, ${body})`;

  for (const pick of PICKS) {
    const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = ${pick.symbol}`;
    if (st.length === 0) throw new Error(`stock not in master: ${pick.symbol}`);
    const { id: stockId, lastClose, name } = st[0] as any;
    if (!lastClose) throw new Error(`no lastClose for ${pick.symbol}`);
    const units = pick.amount / lastClose;
    const pos = await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
      VALUES (${portfolioId}, ${stockId}, ${units}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', ${pick.amount}, 'MON 9 NOV · OPEN→CLOSE')
      RETURNING "id"`;
    const cl = await sql`
      INSERT INTO "Claim" ("sourceId", "stockId", "portfolioId", "claimText", "quoteSentence", "dueDate")
      VALUES (${sourceId}, ${stockId}, ${portfolioId}, ${pick.claim}, ${pick.claim}, '2026-11-09T00:00:00.000Z') RETURNING "id"`;
    await sql`INSERT INTO "ClaimItem" ("claimId", "label", "state") VALUES (${(cl[0] as any).id}, 'Moves as claimed, open to close, on 9 Nov', 'PENDING')`;
    console.log(`${pick.symbol} (${name}): ₹${pick.amount} booked, pos ${(pos[0] as any).id}, claim ${(cl[0] as any).id}`);
  }
  console.log(`Gemini contest portfolio id ${portfolioId} — ₹1,00,000 fully invested, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
