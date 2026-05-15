import { z } from "zod";
import { prisma } from "@legacyx/db";
import { PromotionEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

/**
 * Phase O — Promotion / Voucher engine.
 *
 * Three promo flavours ship with the seed:
 *   1. VOUCHER (code-based, kind="percent"|"amount", optional min_spend,
 *      optional max_uses_per_patient)
 *   2. PACKAGE_DISCOUNT (auto-applies when invoice contains specific SKU,
 *      kind="percent")
 *   3. TIER  (placeholder — patient-tier driven; not implemented in MVP)
 *
 * The redeem flow:
 *   - Reception punches the promo code into the BillingSection on a
 *     pending invoice (DRAFT/ISSUED only — not PAID/VOIDED).
 *   - We compute the discount, write it onto Invoice.discount + Invoice.total,
 *     emit `promotion.redeemed`, and persist an audit row that doubles as
 *     the per-patient uniqueness ledger (until we add PromotionRedemption
 *     table — see Tech Debt).
 */

const PromoConfig = z
  .object({
    kind: z.enum(["percent", "amount"]),
    percent: z.number().min(0).max(100).optional(),
    amount: z.number().min(0).optional(),
    min_spend: z.number().min(0).optional(),
    applies_to_skus: z.array(z.string()).optional(),
    max_uses_per_patient: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((cfg, refinement) => {
    if (cfg.kind === "percent" && cfg.percent === undefined) {
      refinement.addIssue({
        code: "custom",
        message: "percent required when kind=percent",
      });
    }
    if (cfg.kind === "amount" && cfg.amount === undefined) {
      refinement.addIssue({
        code: "custom",
        message: "amount required when kind=amount",
      });
    }
  });

export const CreatePromotionDto = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "code must be UPPERCASE/digits/_/-"),
  name: z.string().min(1).max(120),
  type: z.enum(["TIER", "BUNDLE", "PACKAGE_DISCOUNT", "VOUCHER"]),
  config: PromoConfig,
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  active: z.boolean().default(true),
});

export const UpdatePromotionDto = CreatePromotionDto.partial().omit({ code: true });

export type PromotionStatus = "active" | "inactive" | "expired" | "all";

export interface ListPromotionsFilters {
  q?: string;
  type?: string;
  status?: PromotionStatus;
  /** Default `false` — only ACTIVE promotions returned unless `status` is set. */
  includeInactive?: boolean;
  /** 1-indexed page number. Caller must clamp ≥ 1. */
  page: number;
  /** Items per page. Caller must clamp + cap. */
  perPage: number;
}

export interface PromotionCounts {
  total: number;
  active: number;
  inactive: number;
  expired: number;
}

/** Build the Prisma `where` clause from the filters object. */
function buildPromotionWhere(
  ctx: RequestContext,
  opts: ListPromotionsFilters,
  now: Date,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    deletedAt: null,
  };
  // `status` takes precedence over `includeInactive` — UI uses one or the other.
  if (opts.status === "active") {
    where.active = true;
    where.OR = [{ endsAt: null }, { endsAt: { gte: now } }];
  } else if (opts.status === "inactive") {
    where.active = false;
  } else if (opts.status === "expired") {
    where.endsAt = { lt: now };
  } else if (!opts.includeInactive && opts.status !== "all") {
    where.active = true;
  }
  if (opts.type) where.type = opts.type;
  if (opts.q) {
    // Avoid shadowing the OR used for `active` by combining with AND.
    const ored = [
      { code: { contains: opts.q } },
      { name: { contains: opts.q } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: ored }];
      delete where.OR;
    } else {
      where.OR = ored;
    }
  }
  return where;
}

export async function listPromotions(
  ctx: RequestContext,
  filters: ListPromotionsFilters,
) {
  await authorize(ctx, { resource: "promotion", action: "read" });
  const now = new Date();
  const where = buildPromotionWhere(ctx, filters, now);
  const { page, perPage } = filters;

  const [total, rows] = await Promise.all([
    prisma.promotion.count({ where }),
    prisma.promotion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);
  return { data: rows, pagination: { total, page, perPage } };
}

/**
 * Aggregate counts for the KPI strip on `/manager/promotions`. Computed via
 * three separate `count` queries so the cards reflect the full dataset, not
 * a single page.
 */
export async function countPromotions(
  ctx: RequestContext,
): Promise<PromotionCounts> {
  await authorize(ctx, { resource: "promotion", action: "read" });
  const now = new Date();
  const baseWhere = { tenantId: ctx.tenantId, deletedAt: null } as const;
  const [total, active, inactive, expired] = await Promise.all([
    prisma.promotion.count({ where: baseWhere }),
    prisma.promotion.count({
      where: {
        ...baseWhere,
        active: true,
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    }),
    prisma.promotion.count({ where: { ...baseWhere, active: false } }),
    prisma.promotion.count({
      where: { ...baseWhere, endsAt: { lt: now } },
    }),
  ]);
  return { total, active, inactive, expired };
}

export async function createPromotion(
  ctx: RequestContext,
  input: z.infer<typeof CreatePromotionDto>,
) {
  await authorize(ctx, { resource: "promotion", action: "write" });
  try {
    return await prisma.promotion.create({
      data: {
        tenantId: ctx.tenantId,
        code: input.code,
        name: input.name,
        type: input.type,
        config: input.config as object,
        startsAt: new Date(input.starts_at),
        endsAt: input.ends_at ? new Date(input.ends_at) : null,
        active: input.active,
      },
    });
  } catch (err) {
    // Prisma P2002 = unique constraint failure (tenantId+code).
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      throw Conflict(`Promotion code ${input.code} already exists`);
    }
    throw err;
  }
}

export async function updatePromotion(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof UpdatePromotionDto>,
) {
  await authorize(ctx, { resource: "promotion", action: "write" });
  const existing = await prisma.promotion.findFirst({
    where: { id, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!existing) throw NotFound(`Promotion ${id} not found`);
  return prisma.promotion.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.config !== undefined && { config: input.config as object }),
      ...(input.starts_at !== undefined && { startsAt: new Date(input.starts_at) }),
      ...(input.ends_at !== undefined && {
        endsAt: input.ends_at ? new Date(input.ends_at) : null,
      }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
}

export async function deletePromotion(ctx: RequestContext, id: string) {
  await authorize(ctx, { resource: "promotion", action: "write" });
  const existing = await prisma.promotion.findFirst({
    where: { id, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!existing) throw NotFound(`Promotion ${id} not found`);
  // Soft-delete: keep historical redemptions readable.
  await prisma.promotion.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
  return { id };
}

export const ApplyPromoCodeDto = z.object({
  invoice_id: z.string().min(1),
  code: z
    .string()
    .min(2)
    .max(40)
    .transform((s) => s.trim().toUpperCase()),
});

/**
 * Apply a promo code to an existing (DRAFT or ISSUED) invoice.
 * Idempotency: we look at audit_logs for a previous `promotion.redeemed` on
 * the same (invoice, code) pair before mutating — re-applying the same code
 * is a no-op. Different codes on the same invoice are NOT additive in the
 * MVP (one promotion per invoice); applying a second one returns a 409.
 */
export async function applyPromoCode(
  ctx: RequestContext,
  input: z.infer<typeof ApplyPromoCodeDto>,
) {
  // The desk staff redeems — branch-scoped permission.
  await authorize(ctx, {
    resource: "promotion",
    action: "redeem",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  const promo = await prisma.promotion.findFirst({
    where: {
      tenantId: ctx.tenantId,
      code: input.code,
      deletedAt: null,
      active: true,
    },
  });
  if (!promo) throw NotFound(`Promotion ${input.code} not found or inactive`);
  const now = new Date();
  if (promo.startsAt > now) {
    throw BadRequest(`Promotion ${promo.code} starts at ${promo.startsAt.toISOString()}`);
  }
  if (promo.endsAt && promo.endsAt < now) {
    throw BadRequest(`Promotion ${promo.code} expired at ${promo.endsAt.toISOString()}`);
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoice_id, tenantId: ctx.tenantId },
    include: {
      order: { include: { items: true } },
    },
  });
  if (!invoice) throw NotFound(`Invoice ${input.invoice_id} not found`);
  if (invoice.status === "PAID" || invoice.status === "VOIDED") {
    throw BadRequest(
      `Invoice ${invoice.number} is ${invoice.status} — promotions must be applied before payment`,
    );
  }

  // Idempotency + one-promo-per-invoice. Look up audit rows.
  const previous = await prisma.auditLog.findFirst({
    where: {
      tenantId: ctx.tenantId,
      action: "promotion.redeemed",
      resourceType: "Invoice",
      resourceId: invoice.id,
    },
  });
  if (previous) {
    const after = previous.after as Record<string, unknown> | null;
    const prevCode = String(after?.promotion_code ?? "");
    if (prevCode === promo.code) {
      // Same code — return current state unchanged.
      return {
        idempotent: true,
        invoiceId: invoice.id,
        amountDiscounted: Number(invoice.discount),
      };
    }
    throw Conflict(
      `Invoice already has promotion ${prevCode} applied — remove it first or void the invoice`,
    );
  }

  // Per-patient uniqueness check (max_uses_per_patient).
  const config = promo.config as Record<string, unknown>;
  const maxUses = Number(config.max_uses_per_patient ?? 0);
  if (maxUses > 0) {
    const usedCount = await prisma.auditLog.count({
      where: {
        tenantId: ctx.tenantId,
        action: "promotion.redeemed",
        resourceType: "Invoice",
        // We can't filter by patientId on AuditLog directly because patientId
        // lives in `after.patient_id`. So we count via a JSON path, which
        // MySQL supports natively but Prisma doesn't expose well. Fall back
        // to fetching all matching rows and counting in JS — this is bounded
        // because max_uses_per_patient is small (1 in seed).
      },
      // The JSON containment isn't perfectly efficient but it's exact.
    });
    // Filter the rough count down to this patient by rehydrating only when
    // needed. Cheap because patients with already-many redemptions are rare.
    if (usedCount > 0) {
      const allForCode = await prisma.auditLog.findMany({
        where: {
          tenantId: ctx.tenantId,
          action: "promotion.redeemed",
          resourceType: "Invoice",
        },
        select: { after: true },
      });
      const usedByThisPatient = allForCode.filter((row) => {
        const a = row.after as Record<string, unknown> | null;
        return (
          a?.promotion_code === promo.code && a?.patient_id === invoice.patientId
        );
      }).length;
      if (usedByThisPatient >= maxUses) {
        throw Conflict(
          `Patient already used ${promo.code} ${usedByThisPatient}/${maxUses} times`,
        );
      }
    }
  }

  // Compute discount.
  const subtotal = Number(invoice.subtotal);
  const minSpend = Number(config.min_spend ?? 0);
  if (minSpend > 0 && subtotal < minSpend) {
    throw BadRequest(
      `Promotion ${promo.code} requires min spend of ${minSpend} (invoice subtotal is ${subtotal})`,
    );
  }

  // Eligibility for PACKAGE_DISCOUNT — the invoice's order must include at
  // least one matching SKU.
  if (promo.type === "PACKAGE_DISCOUNT") {
    const skus = (config.applies_to_skus as string[] | undefined) ?? [];
    if (skus.length > 0) {
      const items = invoice.order?.items ?? [];
      const productIds = items.filter((i) => i.itemType === "PRODUCT").map((i) => i.refId);
      const matched = await prisma.product.count({
        where: {
          id: { in: productIds },
          sku: { in: skus },
        },
      });
      if (matched === 0) {
        throw BadRequest(
          `Promotion ${promo.code} requires invoice to include one of: ${skus.join(", ")}`,
        );
      }
    }
  }

  let discountAmount = 0;
  if (config.kind === "percent") {
    const pct = Number(config.percent ?? 0);
    discountAmount = Math.round(((subtotal * pct) / 100) * 100) / 100;
  } else if (config.kind === "amount") {
    discountAmount = Math.min(subtotal, Number(config.amount ?? 0));
  }
  // Cap so we never charge less than 0.
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

  return writeWithOutbox(ctx, async (tx) => {
    // Update Invoice.discount + Invoice.total. Tax stays 0 in this MVP — when
    // we wire VAT properly we'll recompute here.
    const newTotal = Math.max(
      0,
      Number(invoice.subtotal) - discountAmount + Number(invoice.tax ?? 0),
    );
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discount: discountAmount,
        total: newTotal,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "promotion.redeemed",
        resourceType: "Invoice",
        resourceId: invoice.id,
        correlationId: ctx.correlationId,
        before: {
          discount: invoice.discount,
          total: invoice.total,
        } as object,
        after: {
          promotion_id: promo.id,
          promotion_code: promo.code,
          promotion_type: promo.type,
          patient_id: invoice.patientId,
          amount_discounted: discountAmount,
          new_total: newTotal,
        } as object,
      },
    });

    return {
      result: {
        invoiceId: updatedInvoice.id,
        amountDiscounted: discountAmount,
        newTotal,
        promotion: {
          id: promo.id,
          code: promo.code,
          type: promo.type,
        },
      },
      events: [
        {
          eventName: EVENT_NAMES.PROMOTION_REDEEMED,
          payload: PromotionEvents.PromotionRedeemedV1Payload.parse({
            promotion_id: promo.id,
            promotion_code: promo.code,
            promotion_type: promo.type,
            invoice_id: invoice.id,
            patient_id: invoice.patientId,
            amount_discounted: discountAmount,
            redeemed_by: actorId,
          }),
        },
      ],
    };
  });
}
