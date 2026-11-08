// Ronak's own Mon 9 Nov day-contest book (paper, separate from his
// real portfolio): his six picks at his sizes, NEXT_OPEN → DAY_CLOSE.
// No reasoning was stated, so no claims — the book speaks at the close.
//   npx tsx scripts/book-ronak-contest.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  { symbol: "GLAND", amount: 25000 },
  { symbol: "OLECTRA", amount: 20000 },
  { symbol: "GESHIP", amount: 25000 },
  { symbol: "BANCOINDIA", amount: 10000 },
  { symbol: "FINCABLES", amount: 5000 },
  { symbol: "SIGMAADV", amount: 15000 },
];

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));

  const real = await sql`SELECT "ownerSourceId" FROM "Portfolio" WHERE "isReal" = true LIMIT 1`;
  if (real.length === 0) throw new Error("real portfolio not found");
  const sourceId = (real[0] as any).ownerSourceId;

  const existing = await sql`SELECT "id" FROM "Portfolio" WHERE "name" = 'Ronak — Mon 9 Nov Day Contest'`;
  if (existing.length > 0) throw new Error("already exists: " + (existing[0] as any).id);

  const pf = await sql`
    INSERT INTO "Portfolio" ("name", "ownerSourceId", "startingCash", "cash", "isReal")
    VALUES ('Ronak — Mon 9 Nov Day Contest', ${sourceId}, 100000, 0, false) RETURNING "id"`;
  const portfolioId = (pf[0] as any).id;

  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"Ronak's own picks for Mon 9 Nov (chat, 2026-11-09)"}, ${"Ronak's day-contest book for Monday 9 November 2026, picked after reading all five AI books: GLAND ₹25,000, OLECTRA ₹20,000, GESHIP ₹25,000, BANCOINDIA ₹10,000, FINCABLES ₹5,000, SIGMAADV ₹15,000 — ₹1,00,000 fully invested. Fill at Monday's open (whole shares), sell at Monday's close. No reasoning stated; no claims recorded."})`;

  for (const pick of PICKS) {
    const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = ${pick.symbol}`;
    if (st.length === 0) throw new Error(`stock not in master: ${pick.symbol}`);
    const { id: stockId, lastClose, name } = st[0] as any;
    const pos = await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
      VALUES (${portfolioId}, ${stockId}, ${Math.floor(pick.amount / lastClose)}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', ${pick.amount}, 'MON 9 NOV · OPEN→CLOSE')
      RETURNING "id"`;
    console.log(`${pick.symbol} (${name}): ₹${pick.amount} → ${Math.floor(pick.amount / lastClose)} sh display, pos ${(pos[0] as any).id}`);
  }
  console.log(`Ronak contest portfolio id ${portfolioId} — ₹1,00,000 fully invested, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
