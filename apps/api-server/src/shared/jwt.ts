import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 JWT (no external deps).
 *
 * Used for **patient sessions** (LIFF / patient app). Staff sessions still use
 * opaque tokens stored in the `Session` table — see `password.ts`. We chose JWT
 * for patients because:
 *   - Patient app is mobile-first and may run offline-first; stateless tokens
 *     play nicer with edge caching.
 *   - We don't need server-side session revocation for patients in v1
 *     (revocation can happen by rotating `JWT_SECRET` if abused).
 *
 * Format: header.payload.signature with header always = `{alg:"HS256",typ:"JWT"}`.
 */

type JwtPayload = {
  /** Issuer — always "legacyx" for our tokens. */
  iss: string;
  /** Audience — `"patient"` for patient app sessions; reject if any other value. */
  aud: "patient";
  /** Subject — `patientId` (cuid). */
  sub: string;
  /** Tenant id — separately denormalised for fast lookup without DB hit. */
  tid: string;
  /** Optional LINE user id snapshot (for audit/tracking). */
  lid?: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
};

function getSecret(): Buffer {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("JWT_SECRET not set or too short (need >=16 chars)");
  }
  return Buffer.from(raw, "utf8");
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4);
  const padded = s + "=".repeat(pad === 4 ? 0 : pad);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

const HEADER = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export type SignPatientJwtInput = {
  patientId: string;
  tenantId: string;
  lineUserId?: string;
  /** TTL in seconds; defaults to 14 days. */
  ttlSeconds?: number;
};

export function signPatientJwt(input: SignPatientJwtInput): {
  token: string;
  expiresAt: Date;
} {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 60 * 60 * 24 * 14;
  const payload: JwtPayload = {
    iss: "legacyx",
    aud: "patient",
    sub: input.patientId,
    tid: input.tenantId,
    lid: input.lineUserId,
    iat: now,
    exp: now + ttl,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${HEADER}.${body}`;
  const sig = createHmac("sha256", getSecret()).update(signingInput).digest();
  const token = `${signingInput}.${b64urlEncode(sig)}`;
  return { token, expiresAt: new Date(payload.exp * 1000) };
}

/** Returns null on any verification failure (invalid signature, expired, wrong aud). */
export function verifyPatientJwt(token: string): JwtPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts as [string, string, string];
  if (h !== HEADER) return null;

  const expected = createHmac("sha256", getSecret()).update(`${h}.${b}`).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(s);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(b).toString("utf8")) as JwtPayload;
  } catch {
    return null;
  }
  if (payload.aud !== "patient") return null;
  if (payload.iss !== "legacyx") return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub || !payload.tid) return null;

  return payload;
}
