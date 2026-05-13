import { z } from "zod";
import { OrderEvents, InventoryEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export const StartProcedureDto = z.object({
  performed_by: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const CompleteProcedureDto = z.object({
  performed_by: z.string().optional(),
  notes: z.string().max(2000).optional(),
  wallet_id: z.string().optional(), // if course-based, deduct from this wallet
});

export const CancelProcedureDto = z.object({
  reason: z.string().min(3).max(500),
});

export async function startProcedure(
  ctx: RequestContext,
  procedureId: string,
  input: z.infer<typeof StartProcedureDto>,
) {
  await authorize(ctx, {
    resource: "procedure",
    action: "perform",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const proc = await tx.procedure.findFirst({
      where: { id: procedureId, tenantId: ctx.tenantId },
    });
    if (!proc) throw NotFound(`Procedure ${procedureId} not found`);
    if (proc.status !== "SCHEDULED") {
      throw Conflict(`Procedure in status ${proc.status} cannot start`);
    }
    const performedBy = input.performed_by ?? proc.performedBy ?? actorId;
    const updated = await tx.procedure.update({
      where: { id: proc.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        performedBy,
        notes: input.notes ?? proc.notes,
      },
    });
    return {
      result: updated,
      events: [
        {
          eventName: EVENT_NAMES.PROCEDURE_STARTED,
          payload: OrderEvents.ProcedureStartedV1Payload.parse({
            procedure_id: proc.id,
            order_id: proc.orderId,
            patient_id: proc.patientId,
            performed_by: performedBy,
            started_at: (updated.startedAt ?? new Date()).toISOString(),
            procedure_code: proc.procedureCode,
          }),
        },
      ],
    };
  });
}

export async function completeProcedure(
  ctx: RequestContext,
  procedureId: string,
  input: z.infer<typeof CompleteProcedureDto>,
) {
  await authorize(ctx, {
    resource: "procedure",
    action: "perform",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const proc = await tx.procedure.findFirst({
      where: { id: procedureId, tenantId: ctx.tenantId },
    });
    if (!proc) throw NotFound(`Procedure ${procedureId} not found`);
    if (proc.status === "COMPLETED") throw Conflict("Procedure already completed");
    if (proc.status === "CANCELLED") throw Conflict("Procedure was cancelled");

    const performedBy = input.performed_by ?? proc.performedBy ?? actorId;
    const completedAt = new Date();
    const updated = await tx.procedure.update({
      where: { id: proc.id },
      data: {
        status: "COMPLETED",
        completedAt,
        startedAt: proc.startedAt ?? completedAt,
        performedBy,
        notes: input.notes ?? proc.notes,
      },
    });

    // Inline wallet deduction (if procedure was paid by course package)
    const events: Array<{ eventName: string; payload: unknown }> = [
      {
        eventName: EVENT_NAMES.PROCEDURE_COMPLETED,
        payload: InventoryEvents.ProcedureCompletedV1Payload.parse({
          procedure_id: proc.id,
          order_id: proc.orderId,
          patient_id: proc.patientId,
          performed_by: performedBy,
          completed_at: completedAt.toISOString(),
          procedure_code: proc.procedureCode,
        }),
      },
    ];

    if (input.wallet_id) {
      const wallet = await tx.walletAccount.findFirst({
        where: { id: input.wallet_id, tenantId: ctx.tenantId, patientId: proc.patientId },
      });
      if (!wallet) throw NotFound(`Wallet ${input.wallet_id} not found for patient`);
      if (wallet.expiresAt && wallet.expiresAt < new Date()) throw Conflict("Wallet expired");
      if (wallet.balance < 1) throw Conflict("Insufficient wallet balance");

      const delta = -1;
      const balanceAfter = wallet.balance + delta;
      await tx.walletLedger.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          walletId: wallet.id,
          patientId: wallet.patientId,
          entryType: "USE",
          delta,
          balanceAfter,
          refType: "PROCEDURE",
          refId: proc.id,
          createdBy: actorId,
        },
      });
      await tx.walletAccount.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });
      events.push({
        eventName: EVENT_NAMES.WALLET_USED,
        payload: InventoryEvents.WalletUsedV1Payload.parse({
          wallet_id: wallet.id,
          patient_id: wallet.patientId,
          delta,
          ref_type: "PROCEDURE",
          ref_id: proc.id,
          balance_after: balanceAfter,
        }),
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "procedure.complete",
        resourceType: "Procedure",
        resourceId: proc.id,
        correlationId: ctx.correlationId,
        after: { status: "COMPLETED", performedBy } as object,
      },
    });

    return { result: updated, events };
  });
}

export async function cancelProcedure(
  ctx: RequestContext,
  procedureId: string,
  reason: string,
) {
  await authorize(ctx, {
    resource: "procedure",
    action: "perform",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const proc = await tx.procedure.findFirst({
      where: { id: procedureId, tenantId: ctx.tenantId },
    });
    if (!proc) throw NotFound(`Procedure ${procedureId} not found`);
    if (proc.status === "COMPLETED") {
      throw Conflict("Cannot cancel a completed procedure");
    }
    if (proc.status === "CANCELLED") throw Conflict("Procedure already cancelled");

    const updated = await tx.procedure.update({
      where: { id: proc.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "procedure.cancel",
        resourceType: "Procedure",
        resourceId: proc.id,
        reason,
        correlationId: ctx.correlationId,
      },
    });

    return {
      result: updated,
      events: [
        {
          eventName: EVENT_NAMES.PROCEDURE_CANCELLED,
          payload: OrderEvents.ProcedureCancelledV1Payload.parse({
            procedure_id: proc.id,
            order_id: proc.orderId,
            cancelled_by: actorId,
            reason,
          }),
        },
      ],
    };
  });
}
