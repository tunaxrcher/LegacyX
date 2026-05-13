import { z } from "zod";
import { envelope } from "../envelope";

export const OrderItemSchema = z.object({
  item_type: z.enum(["PROCEDURE", "PRODUCT", "MEDICATION", "COURSE", "OTHER"]),
  ref_id: z.string(),
  description: z.string(),
  qty: z.string(), // Decimal as string for portability
  unit_price: z.string(),
  total: z.string(),
});

export const OrderCreatedV1Payload = z.object({
  order_id: z.string(),
  visit_id: z.string(),
  patient_id: z.string(),
  branch_id: z.string(),
  ordered_by: z.string(),
  total_amount: z.string(),
  items: z.array(OrderItemSchema),
});
export const OrderCreatedV1 = envelope(OrderCreatedV1Payload);

export const OrderCancelledV1Payload = z.object({
  order_id: z.string(),
  reason: z.string(),
  cancelled_by: z.string(),
});
export const OrderCancelledV1 = envelope(OrderCancelledV1Payload);

export const ProcedureStartedV1Payload = z.object({
  procedure_id: z.string(),
  order_id: z.string(),
  patient_id: z.string(),
  performed_by: z.string(),
  started_at: z.string().datetime({ offset: true }),
  procedure_code: z.string(),
});
export const ProcedureStartedV1 = envelope(ProcedureStartedV1Payload);

export const ProcedureCancelledV1Payload = z.object({
  procedure_id: z.string(),
  order_id: z.string(),
  cancelled_by: z.string(),
  reason: z.string(),
});
export const ProcedureCancelledV1 = envelope(ProcedureCancelledV1Payload);

export const StockReceivedV1Payload = z.object({
  ledger_id: z.string(),
  product_id: z.string(),
  qty: z.string(),
  balance_after: z.string(),
  lot_no: z.string().optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
  unit_cost: z.string().optional(),
});
export const StockReceivedV1 = envelope(StockReceivedV1Payload);

export const StockReversedV1Payload = z.object({
  reversal_ledger_id: z.string(),
  original_ledger_id: z.string(),
  product_id: z.string(),
  qty: z.string(),
  balance_after: z.string(),
  reason: z.string(),
});
export const StockReversedV1 = envelope(StockReversedV1Payload);
