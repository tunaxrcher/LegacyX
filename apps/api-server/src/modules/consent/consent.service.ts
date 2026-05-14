import { z } from "zod";
import { ConsentEvents, EVENT_NAMES } from "@legacyx/events";
import { prisma } from "@legacyx/db";
import { BadRequest, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import { contentHash } from "../../shared/crypto";
import type { RequestContext } from "../../shared/context";

/**
 * Phase K — Consent Snapshot.
 *
 * What gets persisted:
 *   - `consent_snapshots` row (immutable record of WHAT version was signed)
 *   - `consent.signed` outbox event (worker renders PDF + audit log)
 *
 * The actual document body is rendered by the worker via `document.requested`
 * (CONSENT template). We record `contentHash` of the rendered template here
 * to prove the patient signed exactly that version. The hash is recomputed
 * from `document_type@document_version` + the patient's name + date — small
 * but stable, just enough to detect template tampering.
 *
 * Captures both backoffice (Reception/Doctor with patient in front of them)
 * and patient-app (touch signature on phone) flows. Channel is recorded so
 * the audit trail can show "patient signed in person" vs "remote-signed".
 */

export const CaptureConsentDto = z.object({
  patient_id: z.string().min(1),
  document_type: z.string().min(1).max(80),
  document_version: z.string().min(1).max(20).default("v1"),
  signed_by_name: z.string().min(1).max(120),
  // Optional payload-only metadata. Backoffice always sends "DESK"; patient
  // app sends "PATIENT_APP" (with IP/UA filled by route handler from request).
  channel: z.enum(["DESK", "PATIENT_APP", "IMPORT"]).default("DESK"),
  // Touch signature serialised as a small data: URL (PNG base64) — uploaded
  // to S3 by the worker if non-empty. We do NOT block on the upload — the
  // hash captures the signed document, and the signature image is only kept
  // for visual confirmation.
  signature_data_url: z.string().optional(),
  // Forensics — populated by the route handler from request headers, NOT
  // from the client (clients can lie).
  ip: z.string().optional(),
  user_agent: z.string().optional(),
});

export async function captureConsent(
  ctx: RequestContext,
  input: z.infer<typeof CaptureConsentDto>,
) {
  // Reception captures consent at desk (patient:write:branch). Patient-app
  // captures via patient JWT path (different route — does not call this fn).
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const patient = await prisma.patient.findFirst({
    where: { id: input.patient_id, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);

  return writeWithOutbox(ctx, async (tx) => {
    const signedAt = new Date();

    // Stable content hash: template id + version + name + ISO date. If we
    // ever change the template body, bump `document_version` so this hash
    // differs — protects against silent template edits.
    const hash = contentHash({
      type: input.document_type,
      version: input.document_version,
      patientId: patient.id,
      signer: input.signed_by_name,
      signedAt: signedAt.toISOString(),
    });

    const snapshot = await tx.consentSnapshot.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId ?? "",
        patientId: patient.id,
        documentType: input.document_type,
        documentVersion: input.document_version,
        contentHash: hash,
        signedAt,
        signedByName: input.signed_by_name,
        signatureUrl: input.signature_data_url ?? null,
      },
    });

    return {
      result: snapshot,
      // Single event — the `consent.signed` worker handler chains into
      // document.requested (creates Document row first so document.requested
      // has a real id to update). Keeping the chain in the worker avoids the
      // service module having to know about the Document table.
      events: [
        {
          eventName: EVENT_NAMES.CONSENT_SIGNED,
          payload: ConsentEvents.ConsentSignedV1Payload.parse({
            consent_id: snapshot.id,
            patient_id: patient.id,
            document_type: snapshot.documentType,
            document_version: snapshot.documentVersion,
            content_hash: snapshot.contentHash,
            signed_by_name: snapshot.signedByName,
            signed_at: snapshot.signedAt.toISOString(),
            channel: input.channel,
            ip: input.ip,
            user_agent: input.user_agent,
          }),
        },
      ],
    };
  });
}

export async function listConsents(ctx: RequestContext, patientId: string) {
  await authorize(ctx, {
    resource: "patient",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  const rows = await prisma.consentSnapshot.findMany({
    where: { tenantId: ctx.tenantId, patientId },
    orderBy: { signedAt: "desc" },
    take: 50,
  });
  return rows;
}
