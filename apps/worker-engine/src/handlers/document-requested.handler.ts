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

function asString(v: unknown, fallback = "-"): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function asMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderE_RECEIPT(data: Record<string, unknown>): string[] {
  return [
    `Invoice Number : ${asString(data.invoice_number)}`,
    `Patient        : ${asString(data.patient_name)}`,
    `Issue Date     : ${asString(data.paid_at)}`,
    "",
    `Subtotal       : ${asMoney(data.subtotal)} THB`,
    `Discount       : ${asMoney(data.discount)} THB`,
    `Total          : ${asMoney(data.total)} ${asString(data.currency, "THB")}`,
    `Payment Method : ${asString(data.method)}`,
    "",
    "Thank you for your visit.",
  ];
}

/**
 * CONSENT renderer — switches risk text by template_code so a single PDF
 * pipeline supports multiple consent flavours. The doctor still confirms +
 * the patient signs; we only add boilerplate that's specific to the kind
 * of procedure being consented to.
 */
const CONSENT_RISK_TEXT: Record<string, string> = {
  CONSENT_GENERAL:
    "I confirm I have been informed of the procedure's purpose, " +
    "the methods used, expected outcomes, and possible risks.",
  CONSENT_LASER:
    "Laser-specific risks include redness, swelling, hyper/hypopigmentation, " +
    "scarring, and (rarely) blistering. I confirm pre-treatment instructions " +
    "(no sun exposure / no retinoids 7 days prior) have been explained.",
  CONSENT_INJECTION:
    "Injection-related risks include bruising, swelling, asymmetry, " +
    "infection, and rare allergic reactions. I confirm I am not pregnant " +
    "or breastfeeding and have disclosed all medications/supplements.",
  CONSENT_PHOTO:
    "I authorise the clinic to capture, store, and use before/after " +
    "photographs for clinical record and (if separately ticked) marketing. " +
    "Marketing usage is opt-in and revocable in writing at any time.",
  CONSENT_DATA:
    "I acknowledge my personal data (incl. medical records and contact " +
    "info) will be processed under the clinic's PDPA Privacy Notice. I have " +
    "the right to access, correct, and request erasure of my data.",
};

function renderCONSENT(template_code: string, data: Record<string, unknown>): string[] {
  const risk =
    CONSENT_RISK_TEXT[template_code] ?? CONSENT_RISK_TEXT.CONSENT_GENERAL!;
  return [
    `Patient    : ${asString(data.patient_name)}`,
    `HN         : ${asString(data.hn)}`,
    `Procedure  : ${asString(data.procedure ?? template_code)}`,
    `Date       : ${asString(data.date)}`,
    `Channel    : ${asString(data.channel)}`,
    "",
    risk,
    "",
    "I have had the opportunity to ask questions, and my questions have",
    "been answered to my satisfaction. I voluntarily consent to proceed.",
    "",
    `Signed by  : ${asString(data.signed_by_name)}`,
    `Signature  : ________________________`,
    "",
    `Document   : ${template_code}@${asString(data.document_version, "v1")}`,
    `Hash       : ${String(data.content_hash ?? "").slice(0, 32)}`,
  ];
}

function renderMEDICAL_CERT(data: Record<string, unknown>): string[] {
  const period =
    data.period_from && data.period_to
      ? `${asString(data.period_from)} → ${asString(data.period_to)} (${asString(data.period_days, "?")} days)`
      : asString(data.period);
  return [
    `Patient    : ${asString(data.patient_name)}`,
    `HN         : ${asString(data.hn)}`,
    `Diagnosis  : ${asString(data.diagnosis)}`,
    `Period     : ${period}`,
    "",
    "This certifies that the patient above was examined and the diagnosis",
    "noted. The recommended rest period is as stated above. Issued for",
    "medical-leave or insurance purposes.",
    "",
    `Recommendation : ${asString(data.recommendation, "Rest as appropriate")}`,
    "",
    `Doctor     : ${asString(data.doctor_name)}`,
    `License No : ${asString(data.doctor_license)}`,
    `Issued     : ${asString(data.issued_at)}`,
    "",
    "Signature: ________________________",
  ];
}

/**
 * TAX_INVOICE — Thai e-Tax style. The renderer just lays out the data
 * legibly; the actual e-Tax XML upload will be done by a separate worker
 * handler that picks up `document.generated` for type=TAX_INVOICE.
 */
function renderTAX_INVOICE(data: Record<string, unknown>): string[] {
  // Recompute VAT 7% on the fly for sanity. If the caller supplied an
  // explicit `vat_amount` we trust it, otherwise compute from total.
  const total = Number(data.total ?? 0);
  const vatRate = Number(data.vat_rate ?? 7) / 100;
  const baseAmount = vatRate > 0 ? total / (1 + vatRate) : total;
  const vatAmount = total - baseAmount;
  return [
    `Tax Invoice No : ${asString(data.tax_invoice_number ?? data.invoice_number)}`,
    `Invoice Date   : ${asString(data.issued_at)}`,
    "",
    "─ Issuer ─",
    `Name           : ${asString(data.issuer_name)}`,
    `Address        : ${asString(data.issuer_address)}`,
    `Tax ID         : ${asString(data.issuer_tax_id)}`,
    `Branch         : ${asString(data.issuer_branch_code, "00000")}`,
    "",
    "─ Buyer ─",
    `Name           : ${asString(data.buyer_name)}`,
    `Address        : ${asString(data.buyer_address)}`,
    `Tax ID         : ${asString(data.buyer_tax_id)}`,
    `Branch         : ${asString(data.buyer_branch_code, "00000")}`,
    "",
    "─ Amounts ─",
    `Goods/Services : ${asMoney(baseAmount)} THB`,
    `VAT (${asString(data.vat_rate, "7")}%)        : ${asMoney(vatAmount)} THB`,
    `Total          : ${asMoney(total)} THB`,
    "",
    `Payment Method : ${asString(data.method, "-")}`,
    `Paid At        : ${asString(data.paid_at)}`,
    "",
    "Authorised Signatory: ________________________",
  ];
}

/**
 * Phase M — LAB_REPORT renderer. Renders the structured payload as a simple
 * key→value table. The lab module guarantees `payload` is a JSON object.
 */
function renderLAB_REPORT(data: Record<string, unknown>): string[] {
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const rows: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    rows.push(`${k.padEnd(20)} : ${asString(v)}`);
  }
  if (rows.length === 0) rows.push("(no readings provided)");
  return [
    `Patient    : ${asString(data.patient_name)}`,
    `HN         : ${asString(data.hn)}`,
    `Panel      : ${asString(data.panel)}`,
    `Resulted   : ${asString(data.resulted_at)}`,
    "",
    "─ Readings ─",
    ...rows,
    "",
    `Lab Order  : ${asString(data.lab_order_id)}`,
    data.file_key
      ? `Original report: ${asString(data.file_key)}`
      : "(no original report attached)",
    "",
    "Reviewed by: ________________________",
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
      return {
        title: `CONSENT — ${template_code}`,
        lines: renderCONSENT(template_code, data),
      };
    case "MEDICAL_CERT":
      return { title: "MEDICAL CERTIFICATE", lines: renderMEDICAL_CERT(data) };
    case "TAX_INVOICE":
      return { title: "TAX INVOICE / ใบกำกับภาษี", lines: renderTAX_INVOICE(data) };
    case "REPORT":
      if (template_code === "LAB_REPORT") {
        return { title: "LAB REPORT", lines: renderLAB_REPORT(data) };
      }
      return {
        title: `REPORT — ${template_code}`,
        lines: [JSON.stringify(data, null, 2)],
      };
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
