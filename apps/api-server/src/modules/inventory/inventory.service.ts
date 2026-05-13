import { z } from "zod";
import { Prisma } from "@legacyx/db";
import { OrderEvents, InventoryEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

const decString = z.union([z.string(), z.number()]).transform((v) => new Prisma.Decimal(v));

export const ReceiveStockDto = z.object({
  product_id: z.string().min(1),
  qty: decString,
  unit_cost: decString.optional(),
  lot_no: z.string().max(64).optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
});

export const AdjustStockDto = z.object({
  product_id: z.string().min(1),
  qty: decString, // signed
  reason: z.string().min(3).max(500),
  lot_no: z.string().max(64).optional(),
});

export const ReverseStockDto = z.object({
  ledger_id: z.string().min(1),
  reason: z.string().min(3).max(500),
});

export const ReconcileStockDto = z.object({
  product_id: z.string().min(1),
  counted_qty: decString,
  notes: z.string().max(500).optional(),
  override_id: z.string().optional(),
});

async function getCurrentBalance(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  productId: string,
): Promise<Prisma.Decimal> {
  const last = await tx.stockLedger.findFirst({
    where: { tenantId, branchId, productId },
    orderBy: { createdAt: "desc" },
    select: { balanceAfter: true },
  });
  return last?.balanceAfter ?? new Prisma.Decimal(0);
}

export async function receiveStock(ctx: RequestContext, input: z.infer<typeof ReceiveStockDto>) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "inventory",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;
  if (input.qty.lte(0)) throw BadRequest("Receive qty must be positive");

  return writeWithOutbox(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.product_id, tenantId: ctx.tenantId },
      select: { id: true, trackStock: true },
    });
    if (!product) throw NotFound(`Product ${input.product_id} not found`);
    if (!product.trackStock) throw BadRequest("Product does not track stock");

    const balance = await getCurrentBalance(tx, ctx.tenantId, ctx.branchId!, product.id);
    const balanceAfter = balance.add(input.qty);

    const ledger = await tx.stockLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        productId: product.id,
        entryType: "RECEIVE",
        qty: input.qty,
        balanceAfter,
        unitCost: input.unit_cost,
        lotNo: input.lot_no,
        expiresAt: input.expires_at ? new Date(input.expires_at) : undefined,
        refType: "RECEIVE_PO",
        refId: input.lot_no ?? `manual_${Date.now()}`,
        notes: input.notes,
        createdBy: actorId,
      },
    });

    return {
      result: ledger,
      events: [
        {
          eventName: EVENT_NAMES.STOCK_RECEIVED,
          payload: OrderEvents.StockReceivedV1Payload.parse({
            ledger_id: ledger.id,
            product_id: product.id,
            qty: input.qty.toString(),
            balance_after: balanceAfter.toString(),
            lot_no: input.lot_no,
            expires_at: input.expires_at,
            unit_cost: input.unit_cost?.toString(),
          }),
        },
      ],
    };
  });
}

export async function adjustStock(ctx: RequestContext, input: z.infer<typeof AdjustStockDto>) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "inventory",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;
  if (input.qty.eq(0)) throw BadRequest("Adjust qty cannot be zero");

  return writeWithOutbox(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.product_id, tenantId: ctx.tenantId },
      select: { id: true, trackStock: true },
    });
    if (!product) throw NotFound(`Product ${input.product_id} not found`);
    if (!product.trackStock) throw BadRequest("Product does not track stock");

    const balance = await getCurrentBalance(tx, ctx.tenantId, ctx.branchId!, product.id);
    const balanceAfter = balance.add(input.qty);
    if (balanceAfter.lt(0)) throw Conflict("Insufficient stock for adjustment");

    const ledger = await tx.stockLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        productId: product.id,
        entryType: "ADJUSTMENT",
        qty: input.qty,
        balanceAfter,
        lotNo: input.lot_no,
        refType: "ADJUSTMENT",
        refId: `manual_${Date.now()}`,
        notes: input.reason,
        createdBy: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "inventory.adjust",
        resourceType: "StockLedger",
        resourceId: ledger.id,
        reason: input.reason,
        correlationId: ctx.correlationId,
        after: { product_id: product.id, qty: input.qty.toString() } as object,
      },
    });

    return {
      result: ledger,
      events: [
        {
          eventName: EVENT_NAMES.INVENTORY_ADJUSTED,
          payload: InventoryEvents.InventoryAdjustedV1Payload.parse({
            ledger_ids: [ledger.id],
            ref_type: "RECONCILE",
            ref_id: ledger.refId ?? ledger.id,
            product_changes: [
              {
                product_id: product.id,
                delta: input.qty.toString(),
                balance_after: balanceAfter.toString(),
              },
            ],
          }),
        },
      ],
    };
  });
}

/**
 * Reverse a single stock ledger entry by appending an opposite-sign REVERSAL
 * row that references the original. Used when:
 *   - a procedure was completed and BOM consumed, then later cancelled/refunded
 *   - a wrong receive/adjust needs undoing without editing immutable history
 *
 * Cannot reverse a row that has itself been reversed.
 */
export async function reverseStock(
  ctx: RequestContext,
  input: z.infer<typeof ReverseStockDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "inventory",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const orig = await tx.stockLedger.findFirst({
      where: { id: input.ledger_id, tenantId: ctx.tenantId },
    });
    if (!orig) throw NotFound(`Ledger entry ${input.ledger_id} not found`);
    if (orig.entryType === "REVERSAL") {
      throw Conflict("Cannot reverse a reversal entry");
    }
    if (orig.branchId !== ctx.branchId) {
      throw Conflict("Reversal must occur in the same branch as the original");
    }
    const already = await tx.stockLedger.findFirst({
      where: { tenantId: ctx.tenantId, reversalOfId: orig.id },
    });
    if (already) throw Conflict("Entry already reversed");

    const currentBalance = await getCurrentBalance(
      tx,
      ctx.tenantId,
      ctx.branchId!,
      orig.productId,
    );
    const reversalQty = orig.qty.negated();
    const balanceAfter = currentBalance.add(reversalQty);
    if (balanceAfter.lt(0)) {
      throw Conflict(
        `Reversal would drive balance negative (current ${currentBalance}, reverse ${reversalQty})`,
      );
    }

    const reversal = await tx.stockLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        productId: orig.productId,
        entryType: "REVERSAL",
        qty: reversalQty,
        balanceAfter,
        lotNo: orig.lotNo,
        refType: orig.refType,
        refId: orig.refId,
        reversalOfId: orig.id,
        notes: input.reason,
        createdBy: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "inventory.reverse",
        resourceType: "StockLedger",
        resourceId: reversal.id,
        reason: input.reason,
        correlationId: ctx.correlationId,
        after: {
          original_ledger_id: orig.id,
          qty: reversalQty.toString(),
        } as object,
      },
    });

    return {
      result: reversal,
      events: [
        {
          eventName: EVENT_NAMES.STOCK_REVERSED,
          payload: OrderEvents.StockReversedV1Payload.parse({
            reversal_ledger_id: reversal.id,
            original_ledger_id: orig.id,
            product_id: orig.productId,
            qty: reversalQty.toString(),
            balance_after: balanceAfter.toString(),
            reason: input.reason,
          }),
        },
      ],
    };
  });
}
