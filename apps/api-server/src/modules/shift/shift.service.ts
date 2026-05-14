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

export const OpenShiftDto = z.object({
  cash_opening: decString,
  notes: z.string().max(500).optional(),
});

export const CloseShiftDto = z.object({
  cash_counted: decString,
  notes: z.string().max(500).optional(),
});

export const UpdateShiftDto = z.object({
  cash_opening: decString.optional(),
  notes: z.string().max(500).optional(),
});

/** Cash methods that flow through the till. CARD/QR/TRANSFER settle directly
 *  to the bank so they do NOT count against the cash drawer expected amount. */
const CASH_METHODS: Array<"CASH" | "OTHER"> = ["CASH", "OTHER"];

/** Find currently open shift for the user's branch (one open shift per
 *  branch is the design — multiple cashiers can share a branch shift, but
 *  the latest open one wins). */
export async function getCurrentShift(ctx: RequestContext) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "shift",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  const shift = await prisma.shift.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      closedAt: null,
    },
    orderBy: { openedAt: "desc" },
  });
  if (!shift) return null;
  // Compute live expected cash so UI shows running total
  const live = await computeExpectedCash(
    ctx.tenantId,
    shift.branchId,
    shift.openedAt,
    new Date(),
  );
  return {
    ...shift,
    cashExpectedLive: live.expected.toString(),
    paymentsCountLive: live.count,
  };
}

export async function listShifts(ctx: RequestContext, limit = 30) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "shift",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  return prisma.shift.findMany({
    where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
    orderBy: { openedAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
}

export async function openShift(
  ctx: RequestContext,
  input: z.infer<typeof OpenShiftDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "shift",
    action: "open",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;
  if (input.cash_opening.lt(0)) {
    throw BadRequest("cash_opening must be >= 0");
  }

  const open = await prisma.shift.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      closedAt: null,
    },
  });
  if (open) throw Conflict("A shift is already open for this branch");

  const created = await prisma.shift.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      openedBy: actorId,
      openedAt: new Date(),
      cashOpening: input.cash_opening,
      notes: input.notes,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: actorId,
      action: "shift.open",
      resourceType: "Shift",
      resourceId: created.id,
      correlationId: ctx.correlationId,
      after: { cash_opening: input.cash_opening.toString() } as object,
    },
  });

  return created;
}

/**
 * Patch an OPEN shift — used by MANAGER (or the cashier who opened) to
 * correct a typo in `cash_opening` or extend `notes`. Closed shifts are
 * immutable for audit reasons.
 */
export async function updateShift(
  ctx: RequestContext,
  shiftId: string,
  input: z.infer<typeof UpdateShiftDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "shift",
    action: "open",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, tenantId: ctx.tenantId, branchId: ctx.branchId },
  });
  if (!shift) throw NotFound(`Shift ${shiftId} not found`);
  if (shift.closedAt) {
    throw Conflict("Cannot edit a closed shift — closed shifts are immutable");
  }
  if (input.cash_opening !== undefined && input.cash_opening.lt(0)) {
    throw BadRequest("cash_opening must be >= 0");
  }
  if (input.cash_opening === undefined && input.notes === undefined) {
    return shift;
  }

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      cashOpening: input.cash_opening ?? undefined,
      notes: input.notes ?? undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: actorId,
      action: "shift.update",
      resourceType: "Shift",
      resourceId: shift.id,
      correlationId: ctx.correlationId,
      before: {
        cash_opening: shift.cashOpening.toString(),
        notes: shift.notes,
      } as object,
      after: {
        cash_opening: updated.cashOpening.toString(),
        notes: updated.notes,
      } as object,
    },
  });
  return updated;
}

async function computeExpectedCash(
  tenantId: string,
  branchId: string,
  from: Date,
  to: Date,
): Promise<{ expected: Prisma.Decimal; count: number }> {
  const rows = await prisma.payment.findMany({
    where: {
      tenantId,
      branchId,
      method: { in: CASH_METHODS },
      // Count payments completed during the shift window (refunds during
      // the same shift get netted because refund rows live in the same
      // invoiceId with negative amount — but to keep accounting simple we
      // sum signed amounts of all payments touched in the window).
      OR: [
        { completedAt: { gte: from, lte: to } },
        { refundedAt: { gte: from, lte: to } },
      ],
    },
    select: { amount: true, state: true },
  });
  let expected = new Prisma.Decimal(0);
  let count = 0;
  for (const r of rows) {
    if (r.state === "COMPLETED" || r.state === "SETTLED") {
      expected = expected.add(r.amount);
      count++;
    } else if (r.state === "REFUNDED") {
      // Refund rows are stored with negated amount already; add as-is to
      // subtract from till.
      expected = expected.add(r.amount);
      count++;
    }
  }
  return { expected, count };
}

export async function closeShift(
  ctx: RequestContext,
  shiftId: string,
  input: z.infer<typeof CloseShiftDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "shift",
    action: "close",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, tenantId: ctx.tenantId, branchId: ctx.branchId! },
    });
    if (!shift) throw NotFound(`Shift ${shiftId} not found`);
    if (shift.closedAt) throw Conflict("Shift already closed");

    const closedAt = new Date();
    const { expected, count } = await computeExpectedCash(
      ctx.tenantId,
      shift.branchId,
      shift.openedAt,
      closedAt,
    );
    const cashExpected = shift.cashOpening.add(expected);
    const variance = input.cash_counted.sub(cashExpected);

    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: {
        closedBy: actorId,
        closedAt,
        cashCounted: input.cash_counted,
        cashExpected,
        variance,
        notes: input.notes ?? shift.notes,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "shift.close",
        resourceType: "Shift",
        resourceId: shift.id,
        correlationId: ctx.correlationId,
        before: {
          cash_opening: shift.cashOpening.toString(),
        } as object,
        after: {
          cash_counted: input.cash_counted.toString(),
          cash_expected: cashExpected.toString(),
          variance: variance.toString(),
        } as object,
      },
    });

    return {
      result: updated,
      events: [
        {
          eventName: EVENT_NAMES.SHIFT_CLOSED,
          payload: EodEvents.ShiftClosedV1Payload.parse({
            shift_id: shift.id,
            branch_id: shift.branchId,
            opened_by: shift.openedBy,
            closed_by: actorId,
            opened_at: shift.openedAt.toISOString(),
            closed_at: closedAt.toISOString(),
            cash_opening: shift.cashOpening.toString(),
            cash_counted: input.cash_counted.toString(),
            cash_expected: cashExpected.toString(),
            variance: variance.toString(),
            payments_count: count,
            notes: input.notes ?? shift.notes ?? undefined,
          }),
        },
      ],
    };
  });
}
