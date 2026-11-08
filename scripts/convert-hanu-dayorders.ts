// Convert Hanu's five Monday picks to the one-day contest plan:
// fully invested (₹90k across the picks + ₹10k Nykaa already in = ₹1L,
// zero cash), each booked as NEXT_OPEN fill + DAY_CLOSE auto-sell with
// a conviction-weighted plannedAmount.
//   npx tsx scripts/convert-hanu-dayorders.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const ALLOC: Record<string, number> = {
  MMFL: 25000, // top pick — results-momentum continuation
  BHEL: 20000, // cleanest catalyst — the Power Grid order
  TECHNOE: 17500, // pre-results run into 12 Nov
  OLECTRA: 15000, // binary results day — sized smaller
  VOLTAS: 12500, // thinnest case of the five
};

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const direct = (process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer");
  const sql = neon(direct);

  let total = 0;
  for (const [symbol, amount] of Object.entries(ALLOC)) {
    const rows = await sql`
      SELECT p."id" AS pid, p."entryPrice" FROM "Position" p
      JOIN "Stock" s ON s."id" = p."stockId"
      WHERE p."portfolioId" = 5 AND s."symbol" = ${symbol} AND p."status" = 'OPEN'`;
    if (rows.length === 0) throw new Error(`position missing: ${symbol}`);
    const { pid, entryPrice } = rows[0] as any;
    const units = amount / entryPrice; // display units until Monday's open reprices them
    await sql`
      UPDATE "Position" SET "plannedAmount" = ${amount}, "entryMode" = 'NEXT_OPEN',
        "exitMode" = 'DAY_CLOSE', "units" = ${units}, "tag" = 'MON 9 NOV · OPEN→CLOSE'
      WHERE "id" = ${pid}`;
    total += amount;
    console.log(`${symbol}: planned ₹${amount} (units ${units.toFixed(3)} @ Fri close ${entryPrice} until open fill)`);
  }
  await sql`UPDATE "Portfolio" SET "cash" = 0 WHERE "id" = 5`;
  console.log(`picks total ₹${total} + Nykaa ₹10,000 = ₹1,00,000 fully invested; cash → ₹0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
