import { createDecipheriv, createHash } from "node:crypto";

/**
 * AES-256-GCM field decryption — duplicate of `apps/api-server/src/shared/crypto.ts`.
 *
 * We need this here so the worker can decrypt patient phone/email for outbound
 * SMS/EMAIL notifications without depending on the api-server module. Both
 * apps read the same `ENCRYPTION_MASTER_KEY`, so payloads are interchangeable.
 *
 * v2 will move this helper to a shared `@legacyx/crypto` package.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) throw new Error("ENCRYPTION_MASTER_KEY not set");
  return createHash("sha256").update(raw).digest();
}

export function decryptField(payload: string): string {
  if (!payload.startsWith("v1:")) throw new Error("Unknown ciphertext version");
  const blob = Buffer.from(payload.slice(3), "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
