// Add Hanu's Monday 9 Nov mover calls to the Hanu paper portfolio:
// 5 positions @ ₹10,000 each at Fri 6 Nov closes, each with its claim
// (the exact call made in chat, 2026-11-09 00:44–00:52 IST) + checklist.
//   npx tsx scripts/add-hanu-monday-picks.ts
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";

const PICKS = [
  {
    symbol: "MMFL",
    claim: "M M Forgings will see results-momentum follow-through on Mon 9 Nov after its +19.95% upper-circuit close on 6 Nov (Q2 PAT ₹45.9 cr printed 5 Nov) — an up day, unless it stays locked at upper circuit.",
    quote: "Tier 1: M M Forgings — results-momentum continuation; buy only if not gapped >~7% and not UC-locked.",
    due: "2026-11-09",
    items: ["Closes up on Mon 9 Nov", "Trades during the day (not UC-locked all session)"],
  },
  {
    symbol: "TECHNOE",
    claim: "Techno Electric will run up into its Q2 results on Wed 12 Nov — a pre-results run worth 5%+ by the 11 Nov close.",
    quote: "Techno Electric — Q2 results Wed 12 Nov, pre-results run candidate; exit before the print if the run gives 10%+.",
    due: "2026-11-11",
    items: ["Up 5%+ from 6 Nov close by 11 Nov close", "Q2 results land on 12 Nov as scheduled"],
  },
  {
    symbol: "OLECTRA",
    claim: "Olectra Greentech will move sharply (10%+) on its Q2 results on Mon 9 Nov — direction set by the print; a beat takes it up.",
    quote: "Olectra Greentech — results Mon 9 Nov, binary ±10–15%; buy only after a beat + price confirmation.",
    due: "2026-11-09",
    items: ["Moves 10%+ (either direction) on results day", "Q2 print beats street expectations"],
  },
  {
    symbol: "BHEL",
    claim: "BHEL will pop 2–4% on Mon 9 Nov on its fresh ₹600–900 cr Power Grid order win announced over the weekend (60:40 lean).",
    quote: "1. BHEL — fresh weekend catalyst: ₹600–900 cr Power Grid order. Lean: 60:40 it pops ~2–4% Monday.",
    due: "2026-11-09",
    items: ["Closes up 2%+ on Mon 9 Nov", "Does not close below ₹400 during the week"],
  },
  {
    symbol: "VOLTAS",
    claim: "Voltas will gain on Mon 9 Nov after its Q2 beat (PAT +53.4% YoY to ₹52.6 cr, revenue ₹2,707 cr vs poll ₹2,556 cr).",
    quote: "3. Voltas — Q2 PAT +53.4% YoY to ₹52.6 cr, revenue ₹2,707 cr beat poll ₹2,556 cr; thinner, seasonal, riskier.",
    due: "2026-11-09",
    items: ["Closes up on Mon 9 Nov"],
  },
];

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const direct = (process.env.DIRECT_URL ?? "").replace("channel_binding=require", "channel_binding=prefer");
  const sql = neon(direct);

  const pf = await sql`
    SELECT p."id", p."name", p."cash", p."ownerSourceId" FROM "Portfolio" p
    JOIN "Source" s ON s."id" = p."ownerSourceId" WHERE s."name" = 'Hanu'`;
  if (pf.length === 0) throw new Error("Hanu portfolio not found");
  const portfolio: any = pf[0];
  console.log("portfolio:", portfolio.name, "id", portfolio.id, "cash", portfolio.cash);
  const perPick = 10000;
  if (portfolio.cash < perPick * PICKS.length) throw new Error("not enough cash");

  const body = PICKS.map((p) => `${p.symbol}: ${p.quote}`).join("\n");
  const st = await sql`
    INSERT INTO "SourceText" ("sourceId", "title", "body")
    VALUES (${portfolio.ownerSourceId}, 'Hanu — Monday 9 Nov mover calls (chat, 2026-11-09 00:44–00:52 IST)', ${body})
    RETURNING "id"`;
  console.log("source text:", st[0].id);

  for (const pick of PICKS) {
    const rows = await sql`
      SELECT s."id" AS sid, c."close" FROM "Stock" s
      JOIN "StockClose" c ON c."stockId" = s."id"
      WHERE s."symbol" = ${pick.symbol} AND c."date" = '2026-11-06T00:00:00.000Z'`;
    if (rows.length === 0) throw new Error(`no 6 Nov close for ${pick.symbol}`);
    const { sid, close } = rows[0] as any;
    const units = perPick / close;
    const pos = await sql`
      INSERT INTO "Position" ("portfolioId", "stockId", "units", "entryPrice", "entryDate", "status")
      VALUES (${portfolio.id}, ${sid}, ${units}, ${close}, '2026-11-06T00:00:00.000Z', 'OPEN')
      RETURNING "id"`;
    const claim = await sql`
      INSERT INTO "Claim" ("sourceId", "stockId", "portfolioId", "claimText", "quoteSentence", "dueDate")
      VALUES (${portfolio.ownerSourceId}, ${sid}, ${portfolio.id}, ${pick.claim}, ${pick.quote}, ${`${pick.due}T00:00:00.000Z`})
      RETURNING "id"`;
    for (const label of pick.items) {
      await sql`INSERT INTO "ClaimItem" ("claimId", "label", "state") VALUES (${claim[0].id}, ${label}, 'PENDING')`;
    }
    console.log(`${pick.symbol}: ${units.toFixed(3)} units @ ₹${close} (pos ${pos[0].id}, claim ${claim[0].id}, due ${pick.due})`);
  }

  const newCash = portfolio.cash - perPick * PICKS.length;
  await sql`UPDATE "Portfolio" SET "cash" = ${newCash} WHERE "id" = ${portfolio.id}`;
  console.log(`cash: ₹${portfolio.cash} → ₹${newCash}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
