// One-off migration helper (deploy): dump every table of the local SQLite
// database to migration-dump.json so load-neon.ts can insert the exact
// same rows into Neon Postgres after the provider flip. Run BEFORE the
// flip, while the generated client still targets SQLite.
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();

async function main() {
  const dump: Record<string, unknown[]> = {
    stocks: await prisma.stock.findMany({ orderBy: { id: "asc" } }),
    sources: await prisma.source.findMany({ orderBy: { id: "asc" } }),
    portfolios: await prisma.portfolio.findMany({ orderBy: { id: "asc" } }),
    snapshots: await prisma.portfolioSnapshot.findMany({ orderBy: { id: "asc" } }),
    positions: await prisma.position.findMany({ orderBy: { id: "asc" } }),
    orders: await prisma.order.findMany({ orderBy: { id: "asc" } }),
    claims: await prisma.claim.findMany({ orderBy: { id: "asc" } }),
    claimItems: await prisma.claimItem.findMany({ orderBy: { id: "asc" } }),
    events: await prisma.catalystEvent.findMany({ orderBy: { id: "asc" } }),
    sourceTexts: await prisma.sourceText.findMany({ orderBy: { id: "asc" } }),
    dayNotes: await prisma.dayNote.findMany({ orderBy: { id: "asc" } }),
    rules: await prisma.rule.findMany({ orderBy: { id: "asc" } }),
  };
  writeFileSync("migration-dump.json", JSON.stringify(dump));
  for (const [table, rows] of Object.entries(dump)) {
    console.log(`${table}: ${rows.length}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
