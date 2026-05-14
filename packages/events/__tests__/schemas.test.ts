import { describe, it, expect } from "vitest";
import {
  ConsentEvents,
  PromotionEvents,
  LabEvents,
} from "../src";

describe("event payload schemas", () => {
  it("accepts a valid consent.signed payload", () => {
    const ok = ConsentEvents.ConsentSignedV1Payload.safeParse({
      consent_id: "c_1",
      patient_id: "p_1",
      document_type: "CONSENT_LASER",
      document_version: "v1",
      content_hash: "abc",
      signed_by_name: "John Doe",
      signed_at: new Date().toISOString(),
      channel: "DESK",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects consent.signed with bad channel", () => {
    const bad = ConsentEvents.ConsentSignedV1Payload.safeParse({
      consent_id: "c_1",
      patient_id: "p_1",
      document_type: "X",
      document_version: "v1",
      content_hash: "h",
      signed_by_name: "n",
      signed_at: new Date().toISOString(),
      channel: "EMAIL", // not allowed
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a valid promotion.redeemed payload", () => {
    const ok = PromotionEvents.PromotionRedeemedV1Payload.safeParse({
      promotion_id: "pr_1",
      promotion_code: "WELCOME10",
      promotion_type: "VOUCHER",
      invoice_id: "inv_1",
      patient_id: "p_1",
      amount_discounted: 250,
      redeemed_by: "u_1",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects promotion.redeemed with negative discount", () => {
    const bad = PromotionEvents.PromotionRedeemedV1Payload.safeParse({
      promotion_id: "pr_1",
      promotion_code: "X",
      promotion_type: "VOUCHER",
      invoice_id: "i",
      patient_id: "p",
      amount_discounted: -5,
      redeemed_by: "u",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a valid lab.resulted payload", () => {
    const ok = LabEvents.LabResultedV1Payload.safeParse({
      lab_order_id: "lo_1",
      lab_result_id: "lr_1",
      patient_id: "p_1",
      panel: "CBC",
      resulted_at: new Date().toISOString(),
      payload: { WBC: "7.4 x10^9/L" },
    });
    expect(ok.success).toBe(true);
  });
});
