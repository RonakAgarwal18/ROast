// One-off deploy helper: apply a Prisma-generated DDL script to Neon over
// the serverless (HTTPS) driver, for networks where raw TCP to Postgres
// port 5432 is blocked (so `prisma db push` cannot connect).
//
//   npx prisma migrate diff --from-empty --to-schema-datamodel \
//     prisma/schema.prisma --script > ddl.sql
//   npx tsx scripts/apply-ddl-neon.ts ddl.sql
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

function directUrl(): string {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^DIRECT_URL=(.+)$/);
        if (m) return m[1].trim();
      }
    } catch {
      // try the next file
    }
  }
  throw new Error("DIRECT_URL not found in .env.local / .env");
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: apply-ddl-neon.ts <ddl.sql>");
  const ddl = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = ddl
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const sql = neon(directUrl());
  console.log(`applying ${statements.length} statements…`);
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log("ok:", stmt.split("\n")[0].slice(0, 80));
  }
  console.log("DDL applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
