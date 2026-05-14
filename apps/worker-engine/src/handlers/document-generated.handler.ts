import { prisma } from "@legacyx/db";
import { PaymentEvents, EVENT_NAMES } from "@legacyx/events";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "document-generated" });

/**
 * Phase L — react to `document.generated` for TAX_INVOICE.
 *
 * Side-effect: append a row to `storage/etax/<tenant>/<yyyy-mm>/etax-invoices.csv`.
 * Real-world this would be replaced by:
 *   - sign each row with the clinic's RD digital cert
 *   - POST as XML to the Revenue Department's e-Tax endpoint
 *   - persist the response receipt id
 *
 * For MVP we ship the CSV — the cert + XML upload is a paid integration
 * that varies by service provider (Inet, BoonTerm, etc.). The CSV format
 * is identical to what every Thai accounting system already imports.
 *
 * Other DocumentTypes (CONSENT, MEDICAL_CERT, E_RECEIPT, …) flow through
 * here too but we just log and ignore — they don't need accounting export.
 */
function exportRoot() {
  return process.env.ETAX_EXPORT_DIR
    ?? path.resolve(process.cwd(), "../../storage/etax");
}

async function run(env: HandlerEnvelope): Promise<void> {
  const payload = PaymentEvents.DocumentGeneratedV1Payload.parse(env.payload);
  if (payload.type !== "TAX_INVOICE") {
    log.debug({ type: payload.type }, "skipped — not a tax invoice");
    return;
  }
  const { tenant_id, branch_id, correlation_id } = env.metadata;

  // We need the structured data that was rendered onto the PDF — which
  // lives only in the originating `document.requested` outbox row. Look
  // it up by causationId (= the document.requested event id).
  let causation: Record<string, unknown> = {};
  if (env.metadata.causation_id) {
    const reqEvent = await prisma.outboxEvent.findFirst({
      where: { eventId: env.metadata.causation_id },
      select: { payload: true },
    });
    if (reqEvent && reqEvent.payload && typeof reqEvent.payload === "object") {
      const reqPayload = reqEvent.payload as Record<string, unknown>;
      if (reqPayload.data && typeof reqPayload.data === "object") {
        causation = reqPayload.data as Record<string, unknown>;
      }
    }
  }

  // CSV row matches the Thai RD e-Tax invoice columns — adjust column
  // mapping in finance config when binding to the real provider.
  const issuedAt = String(causation.issued_at ?? new Date().toISOString());
  const ym = issuedAt.slice(0, 7); // yyyy-mm
  const dir = path.join(exportRoot(), tenant_id, ym);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "etax-invoices.csv");

  const total = Number(causation.total ?? 0);
  const vatRate = Number(causation.vat_rate ?? 7) / 100;
  const base = vatRate > 0 ? total / (1 + vatRate) : total;
  const vat = total - base;

  const row = [
    issuedAt,
    String(causation.tax_invoice_number ?? causation.invoice_number ?? payload.document_id),
    String(causation.issuer_tax_id ?? ""),
    String(causation.issuer_branch_code ?? "00000"),
    String(causation.buyer_tax_id ?? ""),
    String(causation.buyer_name ?? ""),
    base.toFixed(2),
    vat.toFixed(2),
    total.toFixed(2),
    String(causation.vat_rate ?? "7"),
    String(causation.method ?? ""),
    branch_id ?? "",
    correlation_id,
    payload.storage_key,
  ]
    .map((v) => String(v).replace(/"/g, '""'))
    .map((v) => (v.includes(",") ? `"${v}"` : v))
    .join(",");

  await appendFile(file, row + "\n", { encoding: "utf8" });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id ?? null,
      actorUserId: null,
      action: "etax.export",
      resourceType: "Document",
      resourceId: payload.document_id,
      correlationId: correlation_id,
      after: {
        export_file: file,
        tax_invoice_number: causation.tax_invoice_number,
        total,
      } as object,
    },
  });

  log.info({ file, doc: payload.document_id }, "etax row appended");
}

export const documentGeneratedHandler: Handler = {
  name: "document-generated.etax-export",
  eventName: EVENT_NAMES.DOCUMENT_GENERATED,
  run,
};
