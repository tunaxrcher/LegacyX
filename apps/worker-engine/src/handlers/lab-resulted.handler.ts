import { Prisma, prisma } from "@legacyx/db";
import {
  LabEvents,
  PaymentEvents,
  EVENT_NAMES,
  buildEnvelope,
} from "@legacyx/events";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "lab-resulted" });

/**
 * Phase M — `lab.resulted` reaction.
 *
 * Generates a `Document(type=REPORT, templateCode=LAB_REPORT)` so the
 * existing document-requested handler renders a PDF the patient can later
 * download. We chain through the same outbox pattern used for consent /
 * tax-invoice so re-delivery stays idempotent.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = LabEvents.LabResultedV1Payload.parse(env.payload);
  const { tenant_id, branch_id, correlation_id, event_id } = env.metadata;

  const patient = await prisma.patient.findUnique({
    where: { id: payload.patient_id },
    select: { firstName: true, lastName: true, hn: true, homeBranchId: true },
  });
  if (!patient) {
    log.warn({ patient_id: payload.patient_id }, "patient missing, skipping PDF");
    return;
  }
  const effectiveBranch = branch_id ?? patient.homeBranchId;
  if (!effectiveBranch) {
    log.warn({ patient_id: payload.patient_id }, "no branch context, skipping");
    return;
  }

  const existing = await prisma.document.findFirst({
    where: {
      tenantId: tenant_id,
      refType: "LAB_RESULT",
      refId: payload.lab_result_id,
    },
    select: { id: true },
  });
  if (existing) {
    log.info({ lab_result_id: payload.lab_result_id }, "document already chained");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId: tenant_id,
        branchId: effectiveBranch,
        type: "REPORT",
        refType: "LAB_RESULT",
        refId: payload.lab_result_id,
        templateCode: "LAB_REPORT",
        templateVersion: "v1",
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
        type: "REPORT",
        template_code: "LAB_REPORT",
        template_version: "v1",
        ref_type: "LAB_RESULT",
        ref_id: payload.lab_result_id,
        data: {
          patient_name: `${patient.firstName} ${patient.lastName}`,
          hn: patient.hn,
          panel: payload.panel,
          resulted_at: payload.resulted_at,
          payload: payload.payload,
          file_key: payload.file_key,
          lab_order_id: payload.lab_order_id,
        },
      }),
      ctx: {
        eventId: newEventId,
        correlationId: correlation_id,
        causationId: event_id,
        tenantId: tenant_id,
        branchId: effectiveBranch,
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
      { lab_result_id: payload.lab_result_id, doc: doc.id },
      "lab.resulted → document.requested chained",
    );
  });
}

export const labResultedHandler: Handler = {
  name: "lab-resulted.render-pdf",
  eventName: EVENT_NAMES.LAB_RESULTED,
  run,
};
