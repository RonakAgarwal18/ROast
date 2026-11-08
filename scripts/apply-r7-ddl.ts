import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/DIRECT_URL="?([^"\n]+)"?/);
if (!m) throw new Error("DIRECT_URL not found");
const sql = neon(m[1].replace("channel_binding=require", "channel_binding=prefer"));
async function main() {
  await sql`CREATE TABLE IF NOT EXISTS "FundScheme" (
    "id" SERIAL PRIMARY KEY,
    "schemeCode" TEXT NOT NULL,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "option" TEXT NOT NULL,
    "amc" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "nav" DOUBLE PRECISION,
    "navDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "FundScheme_schemeCode_key" ON "FundScheme"("schemeCode")`;
  await sql`CREATE INDEX IF NOT EXISTS "FundScheme_name_idx" ON "FundScheme"("name")`;
  console.log("FundScheme table ready");
}
main().catch((e) => { console.error(e); process.exit(1); });
