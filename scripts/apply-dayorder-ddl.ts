import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/DIRECT_URL="?([^"\n]+)"?/);
if (!m) throw new Error("DIRECT_URL not found");
const sql = neon(m[1].replace("channel_binding=require", "channel_binding=prefer"));
async function main() {
  await sql`ALTER TABLE "StockClose" ADD COLUMN IF NOT EXISTS "open" DOUBLE PRECISION`;
  await sql`ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "entryMode" TEXT NOT NULL DEFAULT 'CLOSE'`;
  await sql`ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exitMode" TEXT NOT NULL DEFAULT 'HOLD'`;
  await sql`ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "plannedAmount" DOUBLE PRECISION`;
  console.log("day-order columns ready");
}
main().catch((e) => { console.error(e); process.exit(1); });
