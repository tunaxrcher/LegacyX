import { z } from "zod";
import { envelope } from "../envelope";

const Money = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Decimal string with up to 2 dp");
const Decimal3 = z.string().regex(/^-?\d+(\.\d{1,3})?$/, "Decimal string with up to 3 dp");

/**
 * shift.closed (v1)
 * Emitted when a cash-handling staff member closes the till for the day.
 * `cash_expected` = sum of CASH (and OTHER, if configured) payments completed
 * during the shift. `variance = counted - expected` (can be negative).
 */
export const ShiftClosedV1Payload = z.object({
  shift_id: z.string(),
  branch_id: z.string(),
  opened_by: z.string(),
  closed_by: z.string(),
  opened_at: z.string().datetime({ offset: true }),
  closed_at: z.string().datetime({ offset: true }),
  cash_opening: Money,
  cash_counted: Money,
  cash_expected: Money,
  variance: Money,
  payments_count: z.number().int().nonnegative(),
  notes: z.string().optional(),
});
export const ShiftClosedV1 = envelope(ShiftClosedV1Payload);

/**
 * payment.settled (v1)
 * Emitted when a previously COMPLETED payment is reconciled with the
 * gateway/bank settlement batch (cash arrives in operating account).
 * One event per payment row keeps downstream accounting simple.
 */
export const PaymentSettledV1Payload = z.object({
  payment_id: z.string(),
  invoice_id: z.string(),
  gateway_settlement_id: z.string(),
  amount: Money,
  fee_amount: Money.optional(),
  net_amount: Money.optional(),
  method: z.enum(["CASH", "CARD", "QR_PROMPTPAY", "TRANSFER", "WALLET", "OTHER"]),
  settled_at: z.string().datetime({ offset: true }),
});
export const PaymentSettledV1 = envelope(PaymentSettledV1Payload);

/**
 * inventory.reconciled (v1)
 * Emitted after a manager performs a stock count for one or more products and
 * accepts (or break-glass overrides) the variance. An adjustment ledger row
 * is created for any non-zero variance.
 */
export const InventoryReconciledV1Payload = z.object({
  branch_id: z.string(),
  performed_by: z.string(),
  override_id: z.string().optional(),
  items: z.array(
    z.object({
      reconciliation_id: z.string(),
      product_id: z.string(),
      system_qty: Decimal3,
      counted_qty: Decimal3,
      variance: Decimal3,
      adjustment_ledger_id: z.string().optional(),
    }),
  ),
});
export const InventoryReconciledV1 = envelope(InventoryReconciledV1Payload);
