import { z } from "zod";
import { envelope } from "../envelope";

const Money = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Decimal string with up to 2 dp");

export const PaymentAuthorizedV1Payload = z.object({
  payment_id: z.string(),
  invoice_id: z.string(),
  amount: Money,
  method: z.enum(["CASH", "CARD", "QR_PROMPTPAY", "TRANSFER", "WALLET", "OTHER"]),
  gateway: z.string().optional(),
  gateway_ref: z.string().optional(),
});
export const PaymentAuthorizedV1 = envelope(PaymentAuthorizedV1Payload);

export const PaymentCompletedV1Payload = z.object({
  payment_id: z.string(),
  invoice_id: z.string(),
  patient_id: z.string(),
  amount: Money,
  method: z.enum(["CASH", "CARD", "QR_PROMPTPAY", "TRANSFER", "WALLET", "OTHER"]),
  completed_at: z.string().datetime({ offset: true }),
  items_summary: z.array(
    z.object({
      type: z.enum(["PROCEDURE", "PRODUCT", "MEDICATION", "COURSE", "OTHER"]),
      ref_id: z.string(),
      qty: z.string(),
      total: Money,
    }),
  ),
});
export const PaymentCompletedV1 = envelope(PaymentCompletedV1Payload);

export const PaymentSettledV1Payload = z.object({
  payment_id: z.string(),
  gateway_settlement_id: z.string(),
  settled_at: z.string().datetime({ offset: true }),
  fee_amount: Money.optional(),
});
export const PaymentSettledV1 = envelope(PaymentSettledV1Payload);

export const PaymentRefundedV1Payload = z.object({
  payment_id: z.string(),
  refund_payment_id: z.string(),
  amount: Money,
  reason: z.string(),
});
export const PaymentRefundedV1 = envelope(PaymentRefundedV1Payload);

export const InvoiceVoidedV1Payload = z.object({
  invoice_id: z.string(),
  voided_by: z.string(),
  reason: z.string(),
});
export const InvoiceVoidedV1 = envelope(InvoiceVoidedV1Payload);

export const InvoiceCreatedV1Payload = z.object({
  invoice_id: z.string(),
  number: z.string(),
  patient_id: z.string(),
  visit_id: z.string().nullable().optional(),
  order_id: z.string().nullable().optional(),
  total: Money,
  status: z.enum(["DRAFT", "ISSUED"]),
});
export const InvoiceCreatedV1 = envelope(InvoiceCreatedV1Payload);

export const InvoicePaidV1Payload = z.object({
  invoice_id: z.string(),
  patient_id: z.string(),
  total: Money,
  paid_at: z.string().datetime({ offset: true }),
});
export const InvoicePaidV1 = envelope(InvoicePaidV1Payload);

export const DocumentRequestedV1Payload = z.object({
  document_id: z.string(),
  type: z.enum(["CONSENT", "MEDICAL_CERT", "E_RECEIPT", "TAX_INVOICE", "PRESCRIPTION", "REPORT", "OTHER"]),
  template_code: z.string(),
  template_version: z.string(),
  ref_type: z.string().optional(),
  ref_id: z.string().optional(),
  data: z.record(z.unknown()),
});
export const DocumentRequestedV1 = envelope(DocumentRequestedV1Payload);

export const DocumentGeneratedV1Payload = z.object({
  document_id: z.string(),
  storage_key: z.string(),
  content_hash: z.string(),
  type: z.enum(["CONSENT", "MEDICAL_CERT", "E_RECEIPT", "TAX_INVOICE", "PRESCRIPTION", "REPORT", "OTHER"]),
});
export const DocumentGeneratedV1 = envelope(DocumentGeneratedV1Payload);
