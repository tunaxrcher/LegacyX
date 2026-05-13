import { z } from "zod";
import { envelope } from "../envelope";

export const ProcedureCompletedV1Payload = z.object({
  procedure_id: z.string(),
  order_id: z.string(),
  patient_id: z.string(),
  performed_by: z.string(),
  completed_at: z.string().datetime({ offset: true }),
  procedure_code: z.string(),
});
export const ProcedureCompletedV1 = envelope(ProcedureCompletedV1Payload);

export const InventoryAdjustedV1Payload = z.object({
  ledger_ids: z.array(z.string()),
  ref_type: z.enum(["PROCEDURE", "ORDER", "RECEIVE_PO", "RECONCILE", "REVERSAL"]),
  ref_id: z.string(),
  product_changes: z.array(
    z.object({
      product_id: z.string(),
      delta: z.string(),
      balance_after: z.string(),
    }),
  ),
});
export const InventoryAdjustedV1 = envelope(InventoryAdjustedV1Payload);

export const WalletPurchasedV1Payload = z.object({
  wallet_id: z.string(),
  patient_id: z.string(),
  product_id: z.string(),
  delta: z.number().int().positive(),
  ref_type: z.enum(["INVOICE", "MANUAL"]),
  ref_id: z.string(),
  balance_after: z.number().int().nonnegative(),
  expires_at: z.string().datetime({ offset: true }).optional(),
});
export const WalletPurchasedV1 = envelope(WalletPurchasedV1Payload);

export const WalletUsedV1Payload = z.object({
  wallet_id: z.string(),
  patient_id: z.string(),
  delta: z.number().int().negative(),
  ref_type: z.literal("PROCEDURE"),
  ref_id: z.string(),
  balance_after: z.number().int().nonnegative(),
});
export const WalletUsedV1 = envelope(WalletUsedV1Payload);

export const WalletReversedV1Payload = z.object({
  wallet_id: z.string(),
  reversal_of_id: z.string(),
  delta: z.number().int().positive(),
  balance_after: z.number().int().nonnegative(),
  reason: z.string(),
});
export const WalletReversedV1 = envelope(WalletReversedV1Payload);
