import { Prisma, prisma } from "@legacyx/db";
import {
  ConsentEvents,
  PaymentEvents,
  EVENT_NAMES,
  buildEnvelope,
} from "@legacyx/events";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "consent-signed" });

/**
 * Phase K — `consent.signed` reaction.
 *
 * Side-effects:
 *   1. Insert a Document(type=CONSENT, refType=CONSENT_SNAPSHOT, refId=consent_id)
 *      row in REQUESTED state.
 *   2. Emit `document.requested` so the existing render handler turns the
 *      template into a PDF and uploads it to storage.
 *
 * We do this in a single $transaction so the document row + the chained
 * outbox event land atomically. Idempotency is handled by the outer
 * dispatcher (ProcessedEvent), so re-deliveries become no-ops.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = ConsentEvents.ConsentSignedV1Payload.parse(env.payload);
  const { tenant_id, branch_id, correlation_id, event_id } = env.metadata;
  if (!branch_id) throw new Error("branch_id required for consent.signed handler");

  // Fetch patient name once for the PDF body. We don't decrypt phone/email
  // here — the consent template only renders public fields.
  const patient = await prisma.patient.findUnique({
    where: { id: payload.patient_id },
    select: { firstName: true, lastName: true, hn: true },
  });
  if (!patient) {
    log.warn({ patient_id: payload.patient_id }, "patient not found — skipping PDF render");
    return;
  }

  // Idempotency: if a Document row already exists for this consent snapshot,
  // skip the chain (the original delivery already produced one).
  const existing = await prisma.document.findFirst({
    where: {
      tenantId: tenant_id,
      refType: "CONSENT_SNAPSHOT",
      refId: payload.consent_id,
    },
    select: { id: true },
  });
  if (existing) {
    log.info({ consent_id: payload.consent_id, doc: existing.id }, "document already chained");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId: tenant_id,
        branchId: branch_id,
        type: "CONSENT",
        refType: "CONSENT_SNAPSHOT",
        refId: payload.consent_id,
        templateCode: payload.document_type,
        templateVersion: payload.document_version,
        storageKey: "",
        contentHash: "",
        status: "REQUESTED",
        generatedBy: null,
      },
    });

    const newEventId = randomUUID();
    const envelope = buildEnvelope({
      eventName: EVENT_NAMES.DOCUMENT_REQUESTED,
      version: "v1",
      payload: PaymentEvents.DocumentRequestedV1Payload.parse({
        document_id: doc.id,
        type: "CONSENT",
        template_code: payload.document_type,
        template_version: payload.document_version,
        ref_type: "CONSENT_SNAPSHOT",
        ref_id: payload.consent_id,
        data: {
          patient_name: `${patient.firstName} ${patient.lastName}`,
          hn: patient.hn,
          procedure: payload.document_type,
          date: payload.signed_at,
          signed_by_name: payload.signed_by_name,
          content_hash: payload.content_hash,
          channel: payload.channel,
        },
      }),
      ctx: {
        eventId: newEventId,
        correlationId: correlation_id,
        causationId: event_id,
        tenantId: tenant_id,
        branchId: branch_id,
        actor: { type: "SYSTEM", id: null },
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventId: newEventId,
        eventName: envelope.metadata.event_name,
        eventVersion: envelope.metadata.event_version,
        correlationId: envelope.metadata.correlation_id,
        causationId: envelope.metadata.causation_id,
        tenantId: envelope.metadata.tenant_id,
        branchId: envelope.metadata.branch_id,
        payload: envelope.payload as Prisma.InputJsonValue,
        metadata: envelope.metadata as unknown as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });

    log.info(
      { consent_id: payload.consent_id, doc: doc.id },
      "consent → document.requested chained",
    );
  });
}

export const consentSignedHandler: Handler = {
  name: "consent-signed.render-pdf",
  eventName: EVENT_NAMES.CONSENT_SIGNED,
  run,
};
