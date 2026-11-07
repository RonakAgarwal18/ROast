// One-off deploy helper: load migration-dump.json (produced by
// dump-sqlite.ts from the old local SQLite DB) into Neon Postgres, in
// foreign-key order, preserving ids, then reset the id sequences.
//
// Uses Neon's HTTP driver (neon()) rather than the Prisma client: this
// VM's network breaks the WebSocket/raw-TCP paths the adapter needs,
// while plain HTTPS works. Column names below match the Prisma models
// (no @map anywhere in the schema).
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

function env(name: string): string {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(new RegExp(`^${name}=(.+)$`));
        if (m) return m[1].trim();
      }
    } catch {
      // try the next file
    }
  }
  throw new Error(`${name} not found in .env.local / .env`);
}

type TableDef = {
  dumpKey: string;
  table: string;
  columns: string[];
  enumColumns?: Record<string, string>;
};

const TABLES: TableDef[] = [
  { dumpKey: "stocks", table: "Stock", columns: ["id", "symbol", "name", "exchange", "lastClose", "prevClose", "closeDate"] },
  { dumpKey: "sources", table: "Source", columns: ["id", "name", "kind"] },
  { dumpKey: "portfolios", table: "Portfolio", columns: ["id", "name", "ownerSourceId", "isReal", "startingCash", "cash", "sizingRule", "createdAt"] },
  { dumpKey: "snapshots", table: "PortfolioSnapshot", columns: ["id", "portfolioId", "date", "totalValue", "returnPct", "niftyClose"] },
  { dumpKey: "positions", table: "Position", columns: ["id", "portfolioId", "stockId", "units", "entryPrice", "entryDate", "targetPrice", "exitPrice", "status", "tag", "sellPrice", "sellDate", "createdAt"] },
  { dumpKey: "orders", table: "Order", columns: ["id", "stockId", "qty", "limitPrice", "targetLow", "targetHigh", "exitPrice", "status", "createdAt"] },
  { dumpKey: "claims", table: "Claim", columns: ["id", "sourceId", "stockId", "portfolioId", "claimText", "quoteSentence", "dueDate", "verdict", "createdAt"], enumColumns: { verdict: "ClaimVerdict" } },
  { dumpKey: "claimItems", table: "ClaimItem", columns: ["id", "claimId", "label", "state"] },
  { dumpKey: "events", table: "CatalystEvent", columns: ["id", "date", "stockId", "title", "kind"] },
  { dumpKey: "sourceTexts", table: "SourceText", columns: ["id", "sourceId", "title", "body", "createdAt"] },
  { dumpKey: "dayNotes", table: "DayNote", columns: ["id", "date", "text"] },
  { dumpKey: "rules", table: "Rule", columns: ["id", "text"] },
];

async function main() {
  const sql = neon(env("DIRECT_URL"));
  const dump = JSON.parse(readFileSync("migration-dump.json", "utf8"));

  for (const def of TABLES) {
    const rows = dump[def.dumpKey] as Record<string, unknown>[];
    const colsSql = def.columns.map((c) => `"${c}"`).join(", ");
    const BATCH = 250;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const params: unknown[] = [];
      const tuples = batch.map((row) => {
        const placeholders = def.columns.map((col) => {
          params.push(row[col] ?? null);
          const cast = def.enumColumns?.[col] ? `::"${def.enumColumns[col]}"` : "";
          return `$${params.length}${cast}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await sql.query(
        `INSERT INTO "${def.table}" (${colsSql}) VALUES ${tuples.join(", ")}`,
        params,
      );
    }
    await sql.query(
      `SELECT setval(pg_get_serial_sequence('"${def.table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${def.table}"), 1))`,
    );
    const count = await sql.query(`SELECT COUNT(*)::int AS n FROM "${def.table}"`);
    console.log(`${def.table}: inserted, count = ${count[0].n} (dump: ${rows.length})`);
  }

  // Spot checks against the known 6 Nov 2026 state.
  const snaps = await sql.query(
    `SELECT p."name" AS portfolio, s."date"::date AS day, s."totalValue" AS value
     FROM "PortfolioSnapshot" s JOIN "Portfolio" p ON p.id = s."portfolioId"
     ORDER BY s."date", p.id`,
  );
  for (const s of snaps) console.log(`snapshot ${s.portfolio} ${s.day} = ${s.value}`);
  const jub = await sql.query(
    `SELECT c."verdict" FROM "Claim" c JOIN "Stock" st ON st.id = c."stockId" WHERE st.symbol = 'JUBLFOOD'`,
  );
  console.log("JUBLFOOD claim verdict:", jub[0]?.verdict);
  const groww = await sql.query(`SELECT "lastClose" FROM "Stock" WHERE symbol = 'GROWW'`);
  console.log("GROWW lastClose:", groww[0]?.lastClose);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
