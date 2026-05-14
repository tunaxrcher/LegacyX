import { createHash } from "node:crypto";

/**
 * Identity helpers shared by api-server, worker-engine, and seed.
 *
 * These three places ALL need to compute the same `phoneHash` for a given
 * (tenantId, phone) pair, otherwise lookups silently fail (e.g. the user
 * "doesn't exist" at login even though they were just seeded). Keeping the
 * helpers here — exported from `@legacyx/db` — is the single source of truth.
 */

/**
 * Normalize a raw phone string into the canonical form we store and hash.
 *
 * Rules (kept intentionally simple — refine as real countries come online):
 *  - Trim surrounding whitespace
 *  - Strip everything that isn't a digit or a leading "+"
 *  - DO NOT canonicalize country code (E.164) yet — that's a v2 concern; we
 *    rely on tenants currently being Thailand-only
 */
export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[^\d+]/g, "");
}

/**
 * Resolve the encryption master key. Throws if not set — we explicitly do NOT
 * fall back to a "dev" default, because a silent default in seed vs. an
 * env-set key in the api-server is exactly how `phoneHash` mismatches happen.
 *
 * If you're running seed and see this throw, set `ENCRYPTION_MASTER_KEY` in
 * your `.env` (see `.env.example`).
 */
function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY not set — refusing to compute identity hashes with a default key. " +
        "Set the env var (see .env.example) before running seed/api/worker.",
    );
  }
  return createHash("sha256").update(raw).digest();
}

/**
 * Deterministic hash for searchable encrypted fields (phone, NID, etc.).
 *
 * Same input → same hash, so we can index it and do
 * `findFirst({ where: { phoneHash } })` without scanning every row.
 *
 * Construction: `sha256( tenantId ":" normalised ":" || sha256(MASTER_KEY) )`
 * - **Deterministic** (lookup works)
 * - **Tenant-scoped** (phone in tenant A and B get different hashes)
 * - **Keyed** by master key (rotating it invalidates all hashes and forces
 *   reindex — acceptable, rare event)
 *
 * NOTE: This is NOT formal HMAC — older comments / docs called it that
 * incorrectly. It's a keyed sha256 with the key mixed in as a second update().
 * Sufficient for our threat model (preventing rainbow tables against the
 * encrypted index column).
 */
export function searchableHash(tenantId: string, plaintext: string): string {
  const normalised = normalizePhone(plaintext);
  return createHash("sha256")
    .update(`${tenantId}:${normalised}:`)
    .update(getEncryptionKey())
    .digest("hex");
}
