// Ronak substitutes Indoborax for the unbookable Spinaroo Commercial
// in Hemant's book: ₹20,000, NEXT_OPEN → DAY_CLOSE. Book = ₹1L full.
//   npx tsx scripts/book-hemant-indoborax.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";
async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));
  const st = await sql`SELECT "id", "lastClose", "name" FROM "Stock" WHERE "symbol" = 'INDOBORAX'`;
  if (st.length === 0) throw new Error("INDOBORAX not in master");
  const { id: stockId, lastClose, name } = st[0] as any;
  const pf = await sql`SELECT "ownerSourceId", "cash"::float FROM "Portfolio" WHERE "id" = 13`;
  const sourceId = (pf[0] as any).ownerSourceId;
  await sql`INSERT INTO "SourceText" ("sourceId", "title", "body") VALUES (${sourceId}, ${"Hemant book completed — Indoborax takes the Spinaroo slot (2026-11-09)"}, ${"Spinaroo Commercial is not in the NSE/BSE master and could not be booked. On Ronak's instruction its ₹20,000 slot goes to Indoborax (Indo Borax & Chemicals), same terms: fill at Monday's open, sell at Monday's close. Hemant's book is now five picks × ₹20,000 = ₹1,00,000, fully invested."})`;
  const pos = await sql`
    INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status", "entryMode", "exitMode", "plannedAmount", "tag")
    VALUES (13, ${stockId}, ${Math.floor(20000 / lastClose)}, ${lastClose}, '2026-11-06T00:00:00.000Z', 'OPEN', 'NEXT_OPEN', 'DAY_CLOSE', 20000, 'MON 9 NOV · OPEN→CLOSE')
    RETURNING "id"`;
  await sql`UPDATE "Portfolio" SET "cash" = 0 WHERE "id" = 13`;
  console.log(`INDOBORAX (${name}) @ close ${lastClose}: ₹20,000 booked, pos ${(pos[0] as any).id} — Hemant book full, cash ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
