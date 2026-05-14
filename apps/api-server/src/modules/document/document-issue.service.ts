import { z } from "zod";
import { PaymentEvents, EVENT_NAMES } from "@legacyx/events";
import { prisma } from "@legacyx/db";
import { BadRequest, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import { decryptField } from "../../shared/crypto";
import type { RequestContext } from "../../shared/context";

/**
 * Phase L — high-level document issuance helpers.
 *
 * `requestDocument` (in `document.service.ts`) is the low-level API: it
 * accepts a free-form `type` + `data` blob and trusts the caller. For
 * type-specific work (Medical Cert, Tax Invoice) we want:
 *   1. tighter ABAC (emr:write for cert; payment:write for tax invoice)
 *   2. validated input shape
 *   3. server-side enrichment from the parent record (Visit / Invoice)
 *      so the UI doesn't have to re-fetch + forward everything.
 */

export const IssueMedicalCertDto = z.object({
  visit_id: z.string().min(1),
  diagnosis: z.string().min(1).max(400),
  period_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  period_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  recommendation: z.string().max(400).optional(),
});

export async function issueMedicalCert(
  ctx: RequestContext,
  input: z.infer<typeof IssueMedicalCertDto>,
) {
  // Doctor scope. NURSE/RECEPTION cannot issue — clinical statement is
  // a doctor's signature.
  await authorize(ctx, {
    resource: "emr",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const visit = await prisma.visit.findFirst({
    where: { id: input.visit_id, tenantId: ctx.tenantId },
  });
  if (!visit) throw NotFound(`Visit ${input.visit_id} not found`);
  const patient = await prisma.patient.findUnique({
    where: { id: visit.patientId },
    select: { firstName: true, lastName: true, hn: true },
  });
  if (!patient) throw NotFound(`Patient for visit ${input.visit_id} not found`);

  const doctor = await prisma.user.findUnique({
    where: { id: ctx.actor.id },
    select: { fullName: true },
  });

  const periodDays = Math.max(
    1,
    Math.round(
      (new Date(input.period_to).getTime() - new Date(input.period_from).getTime()) /
        86_400_000,
    ) + 1,
  );

  return writeWithOutbox(ctx, async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        type: "MEDICAL_CERT",
        refType: "VISIT",
        refId: visit.id,
        templateCode: "MEDICAL_CERT",
        templateVersion: "v1",
        storageKey: "",
        contentHash: "",
        status: "REQUESTED",
        generatedBy: ctx.actor.id,
      },
    });

    return {
      result: doc,
      events: [
        {
          eventName: EVENT_NAMES.DOCUMENT_REQUESTED,
          payload: PaymentEvents.DocumentRequestedV1Payload.parse({
            document_id: doc.id,
            type: "MEDICAL_CERT",
            template_code: "MEDICAL_CERT",
            template_version: "v1",
            ref_type: "VISIT",
            ref_id: visit.id,
            data: {
              patient_name: `${patient.firstName} ${patient.lastName}`,
              hn: patient.hn,
              diagnosis: input.diagnosis,
              period_from: input.period_from,
              period_to: input.period_to,
              period_days: periodDays,
              recommendation: input.recommendation ?? "Rest and follow-up",
              doctor_name: doctor?.fullName ?? ctx.actor.id,
              doctor_license: "—", // populate when User has license_no column
              issued_at: new Date().toISOString(),
            },
          }),
        },
      ],
    };
  });
}

export const IssueTaxInvoiceDto = z.object({
  invoice_id: z.string().min(1),
  buyer_name: z.string().min(1).max(160),
  buyer_address: z.string().min(1).max(400),
  // Thai tax-payer ID = 13 digits. We store as string to keep leading zeros.
  buyer_tax_id: z
    .string()
    .min(10)
    .max(13)
    .regex(/^\d+$/, "Tax ID must be digits only"),
  // Branch code = 5 digits, "00000" = headquarters by RD convention.
  buyer_branch_code: z
    .string()
    .max(5)
    .regex(/^\d*$/, "Branch code must be digits")
    .default("00000"),
  // Issuer info defaults to tenant settings — UI sends overrides if needed.
  issuer_name: z.string().max(160).optional(),
  issuer_address: z.string().max(400).optional(),
  issuer_tax_id: z.string().max(13).optional(),
  issuer_branch_code: z.string().max(5).optional(),
});

export async function issueTaxInvoice(
  ctx: RequestContext,
  input: z.infer<typeof IssueTaxInvoiceDto>,
) {
  // Reception or Manager runs this — same scope as taking payments.
  await authorize(ctx, {
    resource: "payment",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoice_id, tenantId: ctx.tenantId },
    include: {
      patient: { select: { firstName: true, lastName: true, hn: true, phoneEnc: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!invoice) throw NotFound(`Invoice ${input.invoice_id} not found`);
  if (invoice.status !== "PAID") {
    throw BadRequest(
      `Invoice ${invoice.number} is ${invoice.status} — tax invoice can only be issued after payment is settled`,
    );
  }

  // Pull tenant defaults for issuer info (clinic legal entity).
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { settings: true, name: true },
  });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const issuerName =
    input.issuer_name ?? String(settings.legal_name ?? tenant?.name ?? "");
  const issuerAddress =
    input.issuer_address ?? String(settings.legal_address ?? "");
  const issuerTaxId = input.issuer_tax_id ?? String(settings.tax_id ?? "");
  const issuerBranchCode =
    input.issuer_branch_code ?? String(settings.branch_code ?? "00000");

  const completedPayment = invoice.payments.find(
    (p) => p.state === "COMPLETED" || p.state === "SETTLED",
  );

  // Tax invoice number convention: TI-{invoice.number}. Stays unique by
  // virtue of `(tenantId, invoice.number)` already being unique.
  const taxInvoiceNumber = `TI-${invoice.number}`;

  // Decrypt buyer phone for the PDF body — phoneEnc is at-rest encrypted.
  let buyerPhone: string | null = null;
  if (invoice.patient.phoneEnc) {
    try {
      buyerPhone = decryptField(invoice.patient.phoneEnc);
    } catch {
      buyerPhone = null;
    }
  }

  return writeWithOutbox(ctx, async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        type: "TAX_INVOICE",
        refType: "INVOICE",
        refId: invoice.id,
        templateCode: "TAX_INVOICE",
        templateVersion: "v1",
        storageKey: "",
        contentHash: "",
        status: "REQUESTED",
        generatedBy: ctx.actor.id,
      },
    });

    return {
      result: { document: doc, taxInvoiceNumber },
      events: [
        {
          eventName: EVENT_NAMES.DOCUMENT_REQUESTED,
          payload: PaymentEvents.DocumentRequestedV1Payload.parse({
            document_id: doc.id,
            type: "TAX_INVOICE",
            template_code: "TAX_INVOICE",
            template_version: "v1",
            ref_type: "INVOICE",
            ref_id: invoice.id,
            data: {
              tax_invoice_number: taxInvoiceNumber,
              invoice_number: invoice.number,
              issued_at: new Date().toISOString(),
              issuer_name: issuerName,
              issuer_address: issuerAddress,
              issuer_tax_id: issuerTaxId,
              issuer_branch_code: issuerBranchCode,
              buyer_name: input.buyer_name,
              buyer_address: input.buyer_address,
              buyer_tax_id: input.buyer_tax_id,
              buyer_branch_code: input.buyer_branch_code,
              buyer_phone: buyerPhone,
              total: invoice.total,
              vat_rate: 7,
              method: completedPayment?.method ?? "—",
              paid_at:
                completedPayment?.completedAt?.toISOString() ??
                completedPayment?.authorizedAt?.toISOString() ??
                "",
            },
          }),
        },
      ],
    };
  });
}
