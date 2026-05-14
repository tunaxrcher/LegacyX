import { z } from "zod";
import { envelope } from "../envelope";

/**
 * Phase O — Promotion / Voucher events.
 *
 * Why an event (not just an audit row): downstream campaign engines may
 * later want to react to a redemption (e.g. "send a thank-you LINE message
 * the next morning") without each new use case bolting another DB query
 * onto invoice.paid. Keeping it in the outbox means future campaigns are a
 * single subscriber away.
 */
export const PromotionRedeemedV1Payload = z.object({
  promotion_id: z.string(),
  promotion_code: z.string(),
  promotion_type: z.enum(["TIER", "BUNDLE", "PACKAGE_DISCOUNT", "VOUCHER"]),
  invoice_id: z.string(),
  patient_id: z.string(),
  // The numeric discount applied — already factored into Invoice.discount.
  amount_discounted: z.number().nonnegative(),
  redeemed_by: z.string(),
});
export const PromotionRedeemedV1 = envelope(PromotionRedeemedV1Payload);
