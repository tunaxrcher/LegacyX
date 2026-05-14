import { z } from "zod";
import { Prisma, prisma } from "@legacyx/db";
import { EodEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

const decString = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v));

const decStringOptional = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v))
  .optional();

const FeeMapItem = z.object({
  payment_id: z.string(),
  fee_amount: decStringOptional,
});

export const SettleBatchDto = z.object({
  /** Settlement batch reference from the gateway / bank statement.
   *  e.g. "PROMPTPAY-20260514-001" or "STRIPE-tr_abc123". */
  gateway_settlement_id: z.string().min(3).max(120),
  /** ISO date — defaults to now if not supplied (e.g. CASH end-of-day). */
  settled_at: z.string().datetime({ offset: true }).optional(),
  /** Either give explicit payment_ids OR a date range — at least one required. */
  payment_ids: z.array(z.string()).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  methods: z
    .array(z.enum(["CASH", "CARD", "QR_PROMPTPAY", "TRANSFER", "WALLET", "OTHER"]))
    .optional(),
  /** Optional per-payment fees (gateway processing fees). */
  fees: z.array(FeeMapItem).optional(),
  notes: z.string().max(500).optional(),
});

/** Payments completed but not yet settled — for UI list. */
export async function listUnsettled(
  ctx: RequestContext,
  query: {
    methods?: string[];
    from?: string;
    to?: string;
    limit?: number;
  } = {},
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "payment",
    action: "settle",
    target: { branchId: ctx.branchId },
  });
  const limit = Math.min(500, Math.max(1, query.limit ?? 200));
  const where: Prisma.PaymentWhereInput = {
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    state: "COMPLETED",
    settledAt: null,
  };
  if (query.methods?.length) {
    where.method = { in: query.methods as never };
  }
  if (query.from || query.to) {
    where.completedAt = {
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? new Date(query.to) : undefined,
    };
  }
  const rows = await prisma.payment.findMany({
    where,
    orderBy: { completedAt: "desc" },
    take: limit,
    include: {
      invoice: {
        select: { id: true, number: true, patientId: true, total: true },
      },
    },
  });
  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      sum: acc.sum.add(r.amount),
    }),
    { count: 0, sum: new Prisma.Decimal(0) },
  );
  return {
    rows,
    summary: {
      count: totals.count,
      total: totals.sum.toString(),
    },
  };
}

export async function settleBatch(
  ctx: RequestContext,
  input: z.infer<typeof SettleBatchDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "payment",
    action: "settle",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;
  const settledAt = input.settled_at ? new Date(input.settled_at) : new Date();

  // Build the WHERE clause to load candidate payments.
  const whereClauses: Prisma.PaymentWhereInput[] = [];
  if (input.payment_ids?.length) {
    whereClauses.push({ id: { in: input.payment_ids } });
  } else if (input.from || input.to) {
    whereClauses.push({
      completedAt: {
        gte: input.from ? new Date(input.from) : undefined,
        lte: input.to ? new Date(input.to) : undefined,
      },
    });
  } else {
    throw BadRequest("Either payment_ids or from/to must be provided");
  }
  if (input.methods?.length) {
    whereClauses.push({ method: { in: input.methods as never } });
  }

  const feeByPaymentId = new Map<string, Prisma.Decimal>();
  for (const fee of input.fees ?? []) {
    if (fee.fee_amount) feeByPaymentId.set(fee.payment_id, fee.fee_amount);
  }

  return writeWithOutbox(ctx, async (tx) => {
    const candidates = await tx.payment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        state: "COMPLETED",
        settledAt: null,
        AND: whereClauses,
      },
      orderBy: { completedAt: "asc" },
    });
    if (candidates.length === 0) {
      throw Conflict("No COMPLETED payments match the selection");
    }

    const events: Array<{ eventName: string; payload: unknown }> = [];
    let totalGross = new Prisma.Decimal(0);
    let totalFees = new Prisma.Decimal(0);

    for (const p of candidates) {
      const fee = feeByPaymentId.get(p.id);
      const net = fee ? p.amount.sub(fee) : p.amount;

      // Merge gatewaySettlementId into metadata + flip state to SETTLED
      const meta = (p.metadata as Record<string, unknown> | null) ?? {};
      const newMeta = {
        ...meta,
        settlement: {
          batch_id: input.gateway_settlement_id,
          settled_by: actorId,
          fee_amount: fee?.toString(),
          notes: input.notes,
        },
      };

      await tx.payment.update({
        where: { id: p.id },
        data: {
          state: "SETTLED",
          settledAt,
          metadata: newMeta as Prisma.InputJsonValue,
        },
      });

      totalGross = totalGross.add(p.amount);
      if (fee) totalFees = totalFees.add(fee);

      events.push({
        eventName: EVENT_NAMES.PAYMENT_SETTLED,
        payload: EodEvents.PaymentSettledV1Payload.parse({
          payment_id: p.id,
          invoice_id: p.invoiceId,
          gateway_settlement_id: input.gateway_settlement_id,
          amount: p.amount.toString(),
          fee_amount: fee?.toString(),
          net_amount: net.toString(),
          method: p.method,
          settled_at: settledAt.toISOString(),
        }),
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "payment.settle",
        resourceType: "Payment",
        resourceId: input.gateway_settlement_id,
        correlationId: ctx.correlationId,
        after: {
          batch_id: input.gateway_settlement_id,
          payment_count: candidates.length,
          gross: totalGross.toString(),
          fees: totalFees.toString(),
          net: totalGross.sub(totalFees).toString(),
        } as object,
      },
    });

    return {
      result: {
        batch_id: input.gateway_settlement_id,
        payment_count: candidates.length,
        gross: totalGross.toString(),
        fees: totalFees.toString(),
        net: totalGross.sub(totalFees).toString(),
        settled_at: settledAt.toISOString(),
      },
      events,
    };
  });
}
