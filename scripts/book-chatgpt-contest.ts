// Book ChatGPT's Mon 9 Nov day-contest portfolio from its super-prompt
// reply: ₹1L fully invested (2 picks), NEXT_OPEN fills + DAY_CLOSE
// auto-sells, one claim per pick in its own words, text stored verbatim.
//   npx tsx scripts/book-chatgpt-contest.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  { symbol: "FINCABLES", amount: 60000, claim: "Another 10–15% upward move on Monday 9 Nov (earnings surprise, extraordinary volume expansion, strong intraday buying; named risk: profit booking after Sunday's rally)" },
  { symbol: "BANCOINDIA", amount: 40000, claim: "10–12% upward move on Monday 9 Nov, momentum continuation after a 7.6% Muhurat gain on strong results" },
];

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));
  const body = fs.readFileSync("/tmp/contest/chatgpt.txt", "utf8");

  let src = await sql`SELECT "id" FROM "Source" WHERE "name" = 'ChatGPT'`;
  if (src.length === 0) {
    src = await sql`INSERT INTO "Source" ("name", "kind") VALUES ('ChatGPT', 'AI') RETURNING "id"`;
    console.log("created ChatGPT source");
  }
  const sourceId = (src[0] as any).id;

  const existing = await sql`SELECT "id" FROM "Portfolio" WHERE "name" = 'ChatGPT — Mon 9 Nov Day Contest'`;
  if (existing.length > 0) throw new Error("contest portfolio already exists: " + (existing[0] as any).id);

  const pf = await sql`
    INSERT INTO "Portfolio" ("name", "ownerSourceId", "startingCash", "cash", "isReal")
    VALUES ('ChatGPT — Mon 9 Nov Day Contest', ${sourceId}, 100000, 0, false) RETURNING "id"`;
  const portfolioId = (pf[0] as any).id;

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"ChatGPT — super-prompt reply, Mon 9 Nov day contest (pasted 2026-11-09)"}, ${body})`;

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
  console.log(`ChatGPT contest portfolio id ${portfolioId} — ₹1,00,000 fully invested, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
