// Feed Gemini's actual super-prompt reply through the site's parser.
//   npx tsx scripts/test-contest-parse.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";
import { parseAnalysis } from "../src/lib/parser";

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = neon((process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer"));
  const stocks = (await sql`SELECT "id", "symbol", "name", "lastClose" FROM "Stock"`) as any[];
  const text = fs.readFileSync("/tmp/contest/gemini.txt", "utf8");
  const result = parseAnalysis(text, stocks, new Date("2026-11-08T22:00:00Z"));
  console.log("contest:", result.contest, "| due:", result.contestDue);
  for (const p of result.positions) console.log(`POS ${p.symbol} planned ₹${p.plannedAmount} (lastClose ${p.entryPrice})`);
  console.log("total allocated:", result.positions.reduce((a, p) => a + (p.plannedAmount ?? 0), 0));
  for (const c of result.claims) console.log(`CLAIM ${c.symbol} due ${c.dueDate}: ${c.claimText.slice(0, 110)}…`);
}
main().catch((e) => { console.error(e); process.exit(1); });
