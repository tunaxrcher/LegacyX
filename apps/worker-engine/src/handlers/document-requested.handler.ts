import { Prisma, prisma } from "@legacyx/db";
import { PaymentEvents, EVENT_NAMES, buildEnvelope } from "@legacyx/events";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";
import { buildSimplePdf } from "../shared/pdf";

const log = logger.child({ handler: "document-requested" });

function storageRoot() {
  return process.env.STORAGE_DIR ?? path.resolve(process.cwd(), "../../storage/docs");
}

function renderE_RECEIPT(data: Record<string, unknown>): string[] {
  return [
    `Invoice Number : ${String(data.invoice_number ?? "-")}`,
    `Total          : ${String(data.total ?? "-")} ${String(data.currency ?? "THB")}`,
    `Payment Method : ${String(data.method ?? "-")}`,
    `Paid At        : ${String(data.paid_at ?? "-")}`,
    "",
    "Thank you for your visit.",
  ];
}

function renderCONSENT(data: Record<string, unknown>): string[] {
  return [
    `Patient   : ${String(data.patient_name ?? "-")}`,
    `Procedure : ${String(data.procedure ?? "-")}`,
    `Date      : ${String(data.date ?? "-")}`,
    "",
    "I, the undersigned, consent to the procedure described above and",
    "acknowledge that the risks and benefits have been explained to me.",
    "",
    "Signature: ________________________",
  ];
}

function renderMEDICAL_CERT(data: Record<string, unknown>): string[] {
  return [
    `Patient   : ${String(data.patient_name ?? "-")}`,
    `Diagnosis : ${String(data.diagnosis ?? "-")}`,
    `Period    : ${String(data.period ?? "-")}`,
    "",
    "This certifies that the patient above was examined and the diagnosis",
    "is as noted. Issued for medical purposes.",
    "",
    "Doctor: ________________________",
  ];
}

function renderTemplate(
  type: string,
  template_code: string,
  data: Record<string, unknown>,
): { title: string; lines: string[] } {
  switch (type) {
    case "E_RECEIPT":
      return { title: "E-RECEIPT", lines: renderE_RECEIPT(data) };
    case "CONSENT":
      return { title: "CONSENT FORM", lines: renderCONSENT(data) };
    case "MEDICAL_CERT":
      return { title: "MEDICAL CERTIFICATE", lines: renderMEDICAL_CERT(data) };
    default:
      return {
        title: type,
        lines: [`Template: ${template_code}`, "", JSON.stringify(data, null, 2)],
      };
  }
}

async function run(env: HandlerEnvelope): Promise<void> {
  const payload = PaymentEvents.DocumentRequestedV1Payload.parse(env.payload);
  const { tenant_id, branch_id, correlation_id, event_id } = env.metadata;
  log.info({ document_id: payload.document_id, type: payload.type }, "rendering");

  const tpl = renderTemplate(payload.type, payload.template_code, payload.data);
  const pdf = buildSimplePdf(tpl);
  const contentHash = createHash("sha256").update(pdf).digest("hex");

  // Storage key: docs/{tenantId}/{yyyy-mm}/{documentId}.pdf
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const storageKey = path.posix.join(tenant_id, ym, `${payload.document_id}.pdf`);
  const fullPath = path.join(storageRoot(), storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, pdf);
  log.info({ storage_key: storageKey, size: pdf.length }, "pdf written");

  // Update Document row + emit document.generated via outbox atomically
  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: payload.document_id },
      data: { status: "GENERATED", storageKey, contentHash },
    });

    const newEventId = randomUUID();
    const envelope = buildEnvelope({
      eventName: EVENT_NAMES.DOCUMENT_GENERATED,
      version: "v1",
      payload: PaymentEvents.DocumentGeneratedV1Payload.parse({
        document_id: payload.document_id,
        storage_key: storageKey,
        content_hash: contentHash,
        type: payload.type,
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
  });
}

export const documentRequestedHandler: Handler = {
  name: "document-requested.render-pdf",
  eventName: EVENT_NAMES.DOCUMENT_REQUESTED,
  run,
};
