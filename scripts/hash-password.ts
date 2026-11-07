// Generate the owner-login env values (see README → "Owner login").
//
//   npx tsx scripts/hash-password.ts            # prompts for the password
//   npx tsx scripts/hash-password.ts 'secret'   # password as an argument
//                                               # (lands in shell history —
//                                               #  the prompt is safer)
//
// Prints an OWNER_PASSWORD_HASH line (scrypt, via src/lib/session.ts) and
// a freshly generated AUTH_SECRET, ready to paste into .env locally or
// the host's env settings at deploy time. Nothing is written anywhere.

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/session";

async function readPassword(): Promise<string> {
  const fromArg = process.argv[2];
  if (fromArg) return fromArg;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await new Promise<string>((resolve) =>
    rl.question("Owner password: ", resolve)
  );
  rl.close();
  return pw.trim();
}

async function main() {
  const password = await readPassword();
  if (password.length < 8) {
    console.error("Use at least 8 characters.");
    process.exit(1);
  }
  console.log("");
  console.log("# Paste into .env (local) or the host's env settings (deploy):");
  console.log(`OWNER_PASSWORD_HASH=${hashPassword(password)}`);
  console.log(`AUTH_SECRET=${randomBytes(32).toString("hex")}`);
  console.log("# …and set OWNER_EMAIL to the login email. Keep all three secret.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
