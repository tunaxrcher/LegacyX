import { z } from "zod";
import { envelope } from "../envelope";

/**
 * Phase K — PDPA / Consent / Patient Merge events.
 *
 * Why these are separate from emr.* and patient.*:
 *   - `consent.signed` is its own event because the worker needs to render a
 *     CONSENT PDF and (eventually) push it to LINE for the patient to keep.
 *   - `patient.merged` is irreversible — the payload is the only forensic
 *     record of which records were transferred. Keep payload immutable.
 *   - `pdpa.exported` / `pdpa.anonymized` are auditable PDPA actions; the
 *     audit-log handler stores them with extra `pdpa_action: true` flag so
 *     /admin/audit can filter them quickly during a regulator review.
 */

export const ConsentSignedV1Payload = z.object({
  consent_id: z.string(),
  patient_id: z.string(),
  document_type: z.string(), // CONSENT_GENERAL, CONSENT_LASER, ...
  document_version: z.string(),
  content_hash: z.string(),
  signed_by_name: z.string(),
  signed_at: z.string().datetime({ offset: true }),
  // Optional channel context for forensic. Either captured at the desk
  // (channel="DESK", ip = local LAN), via patient app (channel="PATIENT_APP",
  // ip from request), or imported (channel="IMPORT").
  channel: z.enum(["DESK", "PATIENT_APP", "IMPORT"]),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
});
export const ConsentSignedV1 = envelope(ConsentSignedV1Payload);

export const PatientMergedV1Payload = z.object({
  from_patient_id: z.string(),
  into_patient_id: z.string(),
  performed_by: z.string(),
  reason: z.string(),
  // Counts of records moved — for audit + dashboard. We don't dump the
  // actual ids here (they live in patient_merge_logs.diff JSON column).
  moved_counts: z.object({
    appointments: z.number().int().nonnegative(),
    visits: z.number().int().nonnegative(),
    invoices: z.number().int().nonnegative(),
    wallets: z.number().int().nonnegative(),
    emrs: z.number().int().nonnegative(),
    consents: z.number().int().nonnegative(),
  }),
});
export const PatientMergedV1 = envelope(PatientMergedV1Payload);

export const PdpaExportedV1Payload = z.object({
  patient_id: z.string(),
  performed_by: z.string(),
  // S3 key (or local storage path) of the generated zip. The bundle holds
  // every PII record (decrypted) + a manifest. UI offers a one-shot signed URL.
  archive_key: z.string(),
  // Hash of the archive — lets the regulator verify what we shipped.
  archive_sha256: z.string(),
  // Reason / DSR ticket id from the patient. Required by PDPA Article 30.
  reason: z.string(),
});
export const PdpaExportedV1 = envelope(PdpaExportedV1Payload);

export const PdpaAnonymizedV1Payload = z.object({
  patient_id: z.string(),
  performed_by: z.string(),
  // Anonymisation does NOT delete ledgers (PDPA exception for accounting /
  // tax records — 7 years retention). It scrubs name/phone/email/national-id
  // and replaces them with a hashed pseudonym.
  pseudonym: z.string(),
  reason: z.string(),
});
export const PdpaAnonymizedV1 = envelope(PdpaAnonymizedV1Payload);
