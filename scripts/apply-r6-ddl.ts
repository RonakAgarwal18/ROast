import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/DIRECT_URL="?([^"\n]+)"?/);
if (!m) throw new Error("DIRECT_URL not found");
const sql = neon(m[1].replace("channel_binding=require", "channel_binding=prefer"));
async function main() {
  await sql`CREATE TABLE IF NOT EXISTS "StockClose" (
    "id" SERIAL PRIMARY KEY,
    "stockId" INTEGER NOT NULL REFERENCES "Stock"("id") ON DELETE CASCADE,
    "date" TIMESTAMP(3) NOT NULL,
    "close" DOUBLE PRECISION NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "StockClose_stockId_date_key" ON "StockClose"("stockId", "date")`;
  await sql`CREATE INDEX IF NOT EXISTS "StockClose_date_idx" ON "StockClose"("date")`;
  await sql`CREATE TABLE IF NOT EXISTS "MoverNote" (
    "id" SERIAL PRIMARY KEY,
    "date" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "MoverNote_date_symbol_key" ON "MoverNote"("date", "symbol")`;
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('StockClose','MoverNote')`;
  console.log("tables:", rows.map((r) => r.table_name).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); });
