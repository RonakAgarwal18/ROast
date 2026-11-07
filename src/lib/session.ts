// Session + password primitives for the owner login.
//
// Deliberately dependency-free (Node's built-in crypto only) and free of
// any Next.js imports, so it can be used from the proxy (src/proxy.ts),
// server components and server actions alike.
//
// Passwords: scrypt hashes, format
//   scrypt:<N>:<r>:<p>:<salt base64>:<hash base64>
// Sessions: an HMAC-SHA256-signed token in an httpOnly cookie —
//   <payload base64url>.<signature base64url>
// where the payload is JSON { sub: email, exp: epoch ms } and the
// signature key is AUTH_SECRET. Stateless: no session table to keep.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "roast_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ---------------- Passwords ---------------- */

export function hashPassword(password: string): string {
  const N = 16384,
    r = 8,
    p = 1,
    keylen = 64;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---------------- Session tokens ---------------- */

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Create a signed session token for the owner, or null if AUTH_SECRET is unset. */
export function createSessionToken(email: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const payload = Buffer.from(
    JSON.stringify({ sub: email, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Verify a session token; returns the owner's email, or null. */
export function verifySessionToken(token: string | undefined | null): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    if (!data.sub || !data.exp || data.exp < Date.now()) return null;
    return data.sub;
  } catch {
    return null;
  }
}
