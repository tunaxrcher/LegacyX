import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;
const SALT_LEN = 16;

/** Hash a password with scrypt. Output format: `scrypt$N$r$p$salt$hash` (hex). */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Verify a plain password against an encoded hash. Constant-time compare. */
export function verifyPassword(plain: string, encoded: string): boolean {
  try {
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const computed = scryptSync(plain, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

/** Generate an opaque session token (256-bit). Use the hex string in cookies. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a session token for storage at rest (so DB leak doesn't = stolen tokens). */
export function hashSessionToken(token: string): string {
  // SHA-256 is sufficient for opaque tokens (random 256-bit input).
  return createHash("sha256").update(token).digest("hex");
}
