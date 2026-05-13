import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM field encryption.
 *
 * Phase 4 minimal: single master key from ENCRYPTION_MASTER_KEY env.
 * Phase 5 will introduce tenant-scoped DEKs from KMS.
 *
 * Stored format: base64( iv(12) || authTag(16) || ciphertext )
 * Prepended marker "v1:" so we can rotate algorithms later.
 */

const ALG = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) throw new Error("ENCRYPTION_MASTER_KEY not set");
  // Derive a 32-byte key from the configured secret via SHA-256.
  return createHash("sha256").update(raw).digest();
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1:" + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptField(payload: string): string {
  if (!payload.startsWith("v1:")) throw new Error("Unknown ciphertext version");
  const blob = Buffer.from(payload.slice(3), "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Content hash for tamper detection / immutability proof. */
export function contentHash(content: unknown): string {
  return createHash("sha256")
    .update(typeof content === "string" ? content : JSON.stringify(content))
    .digest("hex");
}
