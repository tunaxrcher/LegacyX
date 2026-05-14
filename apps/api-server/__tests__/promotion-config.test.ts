/**
 * Pure-logic tests against the PromoConfig + DTOs in the promotion service.
 *
 * We import the schema directly to avoid pulling Prisma. The Vitest exclude
 * filter still keeps DB-dependent specs out of the default run, but these
 * Zod-only tests are safe to run anywhere.
 */
import { describe, it, expect } from "vitest";
import { CreatePromotionDto } from "../src/modules/promotion/promotion.service";

describe("CreatePromotionDto", () => {
  const today = new Date().toISOString();

  it("accepts a valid percent voucher", () => {
    const ok = CreatePromotionDto.safeParse({
      code: "WELCOME10",
      name: "Welcome 10%",
      type: "VOUCHER",
      config: { kind: "percent", percent: 10 },
      starts_at: today,
      ends_at: null,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a percent voucher missing the percent number", () => {
    const bad = CreatePromotionDto.safeParse({
      code: "X",
      name: "x",
      type: "VOUCHER",
      config: { kind: "percent" },
      starts_at: today,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects code with lowercase / spaces", () => {
    const bad = CreatePromotionDto.safeParse({
      code: "welcome 10",
      name: "x",
      type: "VOUCHER",
      config: { kind: "percent", percent: 10 },
      starts_at: today,
    });
    expect(bad.success).toBe(false);
  });

  it("accepts amount-off voucher", () => {
    const ok = CreatePromotionDto.safeParse({
      code: "FLAT500",
      name: "500 baht off",
      type: "VOUCHER",
      config: { kind: "amount", amount: 500, min_spend: 2000 },
      starts_at: today,
    });
    expect(ok.success).toBe(true);
  });
});
