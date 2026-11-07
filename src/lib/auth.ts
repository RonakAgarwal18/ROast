// Owner auth — server side. Single owner: the credentials live in env
// (OWNER_EMAIL + OWNER_PASSWORD_HASH), the session in a signed httpOnly
// cookie (see src/lib/session.ts). Public read stays open; every write
// path calls requireOwner().

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifyPassword, verifySessionToken } from "./session";

export { SESSION_COOKIE };

export function ownerEmail(): string | null {
  return process.env.OWNER_EMAIL?.trim().toLowerCase() || null;
}

/** True only for the owner's exact email + password. Fails closed when
 *  the env vars are not configured — nobody can log in. */
export function verifyCredentials(email: string, password: string): boolean {
  const owner = ownerEmail();
  const hash = process.env.OWNER_PASSWORD_HASH;
  if (!owner || !hash) return false;
  if (email.trim().toLowerCase() !== owner) return false;
  return verifyPassword(password, hash);
}

/** The logged-in owner's email, or null. */
export async function getOwnerSession(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Gate for every write path: returns the owner email, or redirects to
 *  /login (redirect() throws, so callers never continue past this). */
export async function requireOwner(): Promise<string> {
  const session = await getOwnerSession();
  if (!session) redirect("/login");
  return session;
}
