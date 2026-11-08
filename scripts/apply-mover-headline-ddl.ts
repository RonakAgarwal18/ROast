import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/DIRECT_URL="?([^"\n]+)"?/);
if (!m) throw new Error("DIRECT_URL not found");
const sql = neon(m[1].replace("channel_binding=require", "channel_binding=prefer"));
async function main() {
  await sql`CREATE TABLE IF NOT EXISTS "MoverHeadline" (
    "id" SERIAL PRIMARY KEY,
    "date" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "publishedAt" TIMESTAMP(3)
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "MoverHeadline_date_symbol_title_key" ON "MoverHeadline"("date", "symbol", "title")`;
  await sql`CREATE INDEX IF NOT EXISTS "MoverHeadline_date_symbol_idx" ON "MoverHeadline"("date", "symbol")`;
  console.log("MoverHeadline table ready");
}
main().catch((e) => { console.error(e); process.exit(1); });
