// Claude wrote "HOEC" — Hindustan Oil Exploration's actual NSE symbol
// is HINDOILEXP. Book that one pick into the existing Claude contest
// portfolio (the other five already landed).
//   npx tsx scripts/fix-claude-hoec.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));

  const pf = await sql`SELECT "id" FROM "Portfolio" WHERE "name" = 'Claude — Mon 9 Nov Day Contest'`;
  if (pf.length === 0) throw new Error("Claude contest portfolio missing");
  const portfolioId = (pf[0] as any).id;
  const src = await sql`SELECT "id" FROM "Source" WHERE "name" = 'Claude'`;
  const sourceId = (src[0] as any).id;

  const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = 'HINDOILEXP'`;
  if (st.length === 0) throw new Error("HINDOILEXP also missing from master");
  const { id: stockId, lastClose, name } = st[0] as any;

  const dup = await sql`SELECT "id" FROM "Position" WHERE "portfolioId" = ${portfolioId} AND "stockId" = ${stockId}`;
  if (dup.length > 0) throw new Error("HOEC pick already booked");

  const claim = "Expected move on Mon 9 Nov: +5% to +12%, or a loss — its highest-variance pick (EBITDA +91% off a low base; revenue fell 53%). Claude wrote the symbol as HOEC; the listed NSE symbol is HINDOILEXP";
  const pos = await sql`
    INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
    VALUES (${portfolioId}, ${stockId}, ${10000 / lastClose}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', 10000, 'MON 9 NOV · OPEN→CLOSE')
    RETURNING "id"`;
  const cl = await sql`
    INSERT INTO "Claim" ("sourceId", "stockId", "portfolioId", "claimText", "quoteSentence", "dueDate")
    VALUES (${sourceId}, ${stockId}, ${portfolioId}, ${claim}, ${claim}, '2026-11-09T00:00:00.000Z') RETURNING "id"`;
  await sql`INSERT INTO "ClaimItem" ("claimId", "label", "state") VALUES (${(cl[0] as any).id}, 'Moves as claimed, open to close, on 9 Nov', 'PENDING')`;
  console.log(`HINDOILEXP (${name}): ₹10,000 booked into portfolio ${portfolioId}, pos ${(pos[0] as any).id}, claim ${(cl[0] as any).id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
