import { z } from "zod";
import { ConsentEvents, EVENT_NAMES } from "@legacyx/events";
import { prisma } from "@legacyx/db";
import { createHash } from "node:crypto";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import { decryptField } from "../../shared/crypto";
import type { RequestContext } from "../../shared/context";

/**
 * Phase K — PDPA Data Subject Rights (DSR).
 *
 * Two operations live here:
 *
 *   1. EXPORT — patient asks for "everything you know about me". We bundle
 *      every PII row (decrypted) into a single JSON manifest and return it.
 *      Storage handoff (S3 zip) is intentionally NOT in this MVP — we
 *      return the JSON inline with a content-disposition so the manager
 *      can download it directly from the browser. A subsequent phase can
 *      promote this to a worker-rendered zip in S3 with a signed URL.
 *
 *   2. ANONYMIZE — patient invokes the "right to erasure". PDPA §33 has an
 *      exception for accounting / tax records (must keep 7 years), so we
 *      DO NOT delete ledger rows. Instead we replace name / phone / email /
 *      national-id with a hashed pseudonym so the rows still link to a
 *      stable anonymous id but no longer carry identifying info.
 *
 * Audit: both events go through the outbox (`pdpa.exported`, `pdpa.anonymized`)
 * and the audit-log handler tags them with `pdpa_action: true` so the
 * regulator can pull a full DSR history with one filter.
 */

export const PdpaActionDto = z.object({
  patient_id: z.string().min(1),
  reason: z
    .string()
    .min(8, "Reason must be at least 8 characters (PDPA traceability)")
    .max(500),
});

function safeDecrypt(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    return decryptField(v);
  } catch {
    return null;
  }
}

/** Pseudonym format: "anon-<sha8(patientId+masterKey)>". Stable per patient. */
function pseudonym(patientId: string): string {
  const seed = `${patientId}:${process.env.ENCRYPTION_MASTER_KEY ?? "anon"}`;
  const h = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return `anon-${h}`;
}

export async function exportPatient(
  ctx: RequestContext,
  input: z.infer<typeof PdpaActionDto>,
) {
  await authorize(ctx, { resource: "pdpa", action: "export" });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const performedBy: string = ctx.actor.id;

  const patient = await prisma.patient.findFirst({
    where: { id: input.patient_id, tenantId: ctx.tenantId },
  });
  if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);

  const [
    appointments,
    visits,
    invoices,
    payments,
    walletAccounts,
    walletEntries,
    consents,
    emrs,
    procedures,
    pharmacy,
    documents,
    notifications,
  ] = await Promise.all([
    prisma.appointment.findMany({ where: { patientId: patient.id } }),
    prisma.visit.findMany({ where: { patientId: patient.id } }),
    prisma.invoice.findMany({ where: { patientId: patient.id } }),
    prisma.payment.findMany({
      where: { invoice: { patientId: patient.id } },
    }),
    prisma.walletAccount.findMany({ where: { patientId: patient.id } }),
    prisma.walletLedger.findMany({ where: { patientId: patient.id } }),
    prisma.consentSnapshot.findMany({ where: { patientId: patient.id } }),
    prisma.eMR.findMany({
      where: { patientId: patient.id },
      include: { versions: { select: { version: true, signedAt: true, signedBy: true } } },
    }),
    prisma.procedure.findMany({ where: { patientId: patient.id } }),
    prisma.pharmacyDispense.findMany({ where: { patientId: patient.id } }),
    prisma.document.findMany({
      where: { tenantId: ctx.tenantId, refType: "PATIENT", refId: patient.id },
    }),
    prisma.notificationLog.findMany({
      where: { tenantId: ctx.tenantId, recipientRef: patient.id },
    }),
  ]);

  // Build the manifest. PII fields are decrypted ONCE here and never logged.
  const manifest = {
    schema_version: "pdpa-export-v1",
    exported_at: new Date().toISOString(),
    exported_by: performedBy,
    correlation_id: ctx.correlationId,
    tenant_id: ctx.tenantId,
    reason: input.reason,
    patient: {
      id: patient.id,
      hn: patient.hn,
      firstName: patient.firstName,
      lastName: patient.lastName,
      nickname: safeDecrypt(patient.nicknameEnc),
      nationalId: safeDecrypt(patient.nationalIdEnc),
      phone: safeDecrypt(patient.phoneEnc),
      email: safeDecrypt(patient.emailEnc),
      dob: patient.dob?.toISOString() ?? null,
      gender: patient.gender,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      lineUserId: patient.lineUserId,
      kycImageUrl: patient.kycImageUrl,
      verificationStatus: patient.verificationStatus,
      status: patient.status,
      createdAt: patient.createdAt.toISOString(),
    },
    appointments,
    visits,
    invoices,
    payments,
    wallets: { accounts: walletAccounts, ledger: walletEntries },
    consents,
    emrs,
    procedures,
    pharmacy_dispenses: pharmacy,
    documents,
    notifications,
  };

  // Hash the manifest for tamper proof. Stored in audit log + event.
  const archiveBlob = JSON.stringify(manifest);
  const archiveSha = createHash("sha256").update(archiveBlob).digest("hex");
  // Pseudo "archive_key" — for the MVP we don't push to S3 yet; if/when a
  // worker handler picks up `pdpa.exported` it can upload the JSON and
  // overwrite `archive_url` in audit. For now key = the audit log id.
  const archiveKey = `pdpa-export/${ctx.tenantId}/${patient.id}/${archiveSha.slice(0, 12)}.json`;

  await writeWithOutbox(ctx, async (tx) => {
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: performedBy,
        action: "pdpa.export",
        resourceType: "Patient",
        resourceId: patient.id,
        correlationId: ctx.correlationId,
        after: {
          archiveKey,
          archiveSha,
          size: archiveBlob.length,
          reason: input.reason,
          // Discriminator the audit UI uses to filter "PDPA actions only".
          pdpa_action: true,
        } as object,
      },
    });
    return {
      result: null,
      events: [
        {
          eventName: EVENT_NAMES.PDPA_EXPORTED,
          payload: ConsentEvents.PdpaExportedV1Payload.parse({
            patient_id: patient.id,
            performed_by: performedBy,
            archive_key: archiveKey,
            archive_sha256: archiveSha,
            reason: input.reason,
          }),
        },
      ],
    };
  });

  return { manifest, archive: { key: archiveKey, sha256: archiveSha, size: archiveBlob.length } };
}

export async function anonymizePatient(
  ctx: RequestContext,
  input: z.infer<typeof PdpaActionDto>,
) {
  await authorize(ctx, { resource: "pdpa", action: "anonymize" });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const performedBy: string = ctx.actor.id;

  const patient = await prisma.patient.findFirst({
    where: { id: input.patient_id, tenantId: ctx.tenantId },
  });
  if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);
  if (patient.status === "MERGED") {
    throw Conflict("Patient is merged — anonymise the surviving record instead");
  }

  const pseudo = pseudonym(patient.id);
  return writeWithOutbox(ctx, async (tx) => {
    // Replace identifying fields. We keep `id`, `hn`, `dob` (year only is
    // typically sufficient for actuarial), and ledger references intact.
    await tx.patient.update({
      where: { id: patient.id },
      data: {
        firstName: pseudo,
        lastName: "(redacted)",
        nicknameEnc: null,
        nationalIdEnc: null,
        phoneEnc: null,
        emailEnc: null,
        phoneHash: null,
        lineUserId: null,
        kycImageUrl: null,
        // Status flips to INACTIVE so lookups can filter it out cleanly.
        status: "INACTIVE",
      },
    });

    // Phase S — soft-delete every photo (KYC + clinical). Ledger-style data
    // (visits/invoices) stays for the 7-year accounting retention; photos
    // are pure PII so we wipe them at the metadata layer immediately. The
    // S3 garbage collector worker (future) will purge the actual blobs once
    // the deletion grace window has expired.
    await tx.patientPhoto.updateMany({
      where: { patientId: patient.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: performedBy,
        action: "pdpa.anonymize",
        resourceType: "Patient",
        resourceId: patient.id,
        correlationId: ctx.correlationId,
        before: {
          firstName: patient.firstName,
          lastName: patient.lastName,
          status: patient.status,
        } as object,
        after: {
          pseudonym: pseudo,
          status: "INACTIVE",
          reason: input.reason,
          pdpa_action: true,
        } as object,
      },
    });

    return {
      result: { patientId: patient.id, pseudonym: pseudo },
      events: [
        {
          eventName: EVENT_NAMES.PDPA_ANONYMIZED,
          payload: ConsentEvents.PdpaAnonymizedV1Payload.parse({
            patient_id: patient.id,
            performed_by: performedBy,
            pseudonym: pseudo,
            reason: input.reason,
          }),
        },
      ],
    };
  });
}
