import { z } from "zod";
import { Prisma } from "@legacyx/db";
import { OrderEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";
import { assertNoAllergyConflict } from "../allergy/allergy.service";

const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v));

const OrderItemDto = z.object({
  item_type: z.enum(["PROCEDURE", "PRODUCT", "MEDICATION", "COURSE", "OTHER"]),
  ref_id: z.string().min(1),
  description: z.string().min(1).max(500),
  qty: decimalString,
  unit_price: decimalString.optional(),
  discount: decimalString.optional(),
  // For PROCEDURE items: tag for who will perform (optional override)
  performed_by: z.string().optional(),
  // For COURSE/PROCEDURE that consume wallet:
  wallet_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateOrderDto = z.object({
  visit_id: z.string().min(1),
  notes: z.string().max(2000).optional(),
  items: z.array(OrderItemDto).min(1).max(50),
  /**
   * Allergy ids the prescriber explicitly acknowledged after seeing the
   * AllergyAlertDialog. Without this, MEDICATION lines that match the
   * patient's allergy list will be rejected at the service layer.
   */
  acknowledged_allergy_ids: z.array(z.string()).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderDto>;

export const CancelOrderDto = z.object({
  reason: z.string().min(3).max(500),
});

function dec(v: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(v);
}

export async function createOrder(ctx: RequestContext, input: CreateOrderInput) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "order",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id: input.visit_id, tenantId: ctx.tenantId, branchId: ctx.branchId! },
    });
    if (!visit) throw NotFound(`Visit ${input.visit_id} not found`);
    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw Conflict(`Cannot add orders to ${visit.status} visit`);
    }
    if (!ctx.actor.id) throw BadRequest("Authenticated user required");
    const actorId: string = ctx.actor.id;

    // Auto-bump visit to IN_PROGRESS on first clinical action — so staff don't
    // have to remember to click "Send to exam room" before ordering. startedAt
    // is set once and never overwritten, which keeps the waiting-time metric
    // accurate even if the order is later cancelled.
    if (visit.status === "OPEN") {
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    // Clinical safety net (Phase R) — check MEDICATION items against the
    // patient's recorded allergies. Throws structured Conflict the UI can
    // surface as an AllergyAlertDialog. Acknowledging the dialog re-submits
    // the order with `acknowledged_allergy_ids` set, which routes through
    // the override path AND records every overridden allergy in the audit
    // log so the regulator can see the override decision.
    const medicationProductIds = input.items
      .filter((i) => i.item_type === "MEDICATION")
      .map((i) => i.ref_id);
    const allergyOverrides = await assertNoAllergyConflict({
      ctx,
      patientId: visit.patientId,
      productIds: medicationProductIds,
      acknowledgedAllergyIds: input.acknowledged_allergy_ids,
    });

    // Resolve product prices for items without unit_price
    const productRefIds = input.items
      .filter((i) => i.item_type !== "PROCEDURE")
      .map((i) => i.ref_id);
    const products = productRefIds.length
      ? await tx.product.findMany({
          where: { id: { in: productRefIds }, tenantId: ctx.tenantId },
          select: {
            id: true,
            name: true,
            attributes: true,
            category: true,
            trackStock: true,
          },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Build item rows and total
    let total = dec(0);
    const itemRows = input.items.map((it) => {
      const unitPrice =
        it.unit_price ??
        dec(
          (it.item_type !== "PROCEDURE"
            ? Number(
                (productMap.get(it.ref_id)?.attributes as { price?: number } | null)
                  ?.price ?? 0,
              )
            : 0) || 0,
        );
      const discount = it.discount ?? dec(0);
      const itemTotal = unitPrice.mul(it.qty).sub(discount);
      total = total.add(itemTotal);
      return {
        itemType: it.item_type,
        refId: it.ref_id,
        description: it.description,
        qty: it.qty,
        unitPrice,
        discount,
        total: itemTotal,
        metadata: (it.metadata ?? null) as Prisma.InputJsonValue,
        // pass through for downstream procedure / wallet handling
        _performedBy: it.performed_by,
        _walletId: it.wallet_id,
      };
    });

    const orderRow = await tx.order.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        visitId: visit.id,
        patientId: visit.patientId,
        orderedBy: actorId,
        status: "CONFIRMED",
        totalAmount: total,
        notes: input.notes,
      },
    });

    const createdItems = await Promise.all(
      itemRows.map((row) =>
        tx.orderItem.create({
          data: {
            orderId: orderRow.id,
            itemType: row.itemType,
            refId: row.refId,
            description: row.description,
            qty: row.qty,
            unitPrice: row.unitPrice,
            discount: row.discount,
            total: row.total,
            metadata: row.metadata,
          },
        })
      )
    );

    // Auto-create Procedure rows for PROCEDURE items
    const procedures = [];
    for (let i = 0; i < itemRows.length; i++) {
      const src = itemRows[i]!;
      if (src.itemType !== "PROCEDURE") continue;
      const proc = await tx.procedure.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId!,
          orderId: orderRow.id,
          patientId: visit.patientId,
          performedBy: src._performedBy,
          procedureCode: src.refId,
          status: "SCHEDULED",
          notes: src.description,
        },
      });
      procedures.push(proc);
    }

    const order = { ...orderRow, items: createdItems };

    // Audit
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id,
        action: "order.create",
        resourceType: "Order",
        resourceId: order.id,
        correlationId: ctx.correlationId,
        after: {
          visitId: visit.id,
          itemCount: order.items.length,
          total: total.toString(),
        } as object,
      },
    });

    // Clinical safety: log every acknowledged allergy override on its own
    // row so a regulator audit can answer "show me every drug-allergy
    // override this month" with a single query.
    if (allergyOverrides.overrides.length > 0) {
      await tx.auditLog.createMany({
        data: allergyOverrides.overrides.map((c) => ({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          actorUserId: ctx.actor.id,
          action: "allergy.override",
          resourceType: "Order",
          resourceId: order.id,
          correlationId: ctx.correlationId,
          after: {
            patientId: visit.patientId,
            allergyId: c.allergyId,
            substance: c.substance,
            severity: c.severity,
            productId: c.productId,
            matchedIngredient: c.matchedIngredient,
          } as object,
        })),
      });
    }

    return {
      result: { order, procedures },
      events: [
        {
          eventName: EVENT_NAMES.ORDER_CREATED,
          payload: OrderEvents.OrderCreatedV1Payload.parse({
            order_id: order.id,
            visit_id: visit.id,
            patient_id: visit.patientId,
            branch_id: visit.branchId,
            ordered_by: actorId,
            total_amount: total.toString(),
            items: order.items.map((it) => ({
              item_type: it.itemType,
              ref_id: it.refId,
              description: it.description,
              qty: it.qty.toString(),
              unit_price: it.unitPrice.toString(),
              total: it.total.toString(),
            })),
          }),
        },
      ],
    };
  });
}

export async function cancelOrder(
  ctx: RequestContext,
  orderId: string,
  reason: string,
) {
  await authorize(ctx, {
    resource: "order",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  return writeWithOutbox(ctx, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { procedures: true },
    });
    if (!order) throw NotFound(`Order ${orderId} not found`);
    if (order.status === "FULFILLED") {
      throw Conflict("Cannot cancel a fulfilled order — use refund/reversal instead");
    }
    if (order.status === "CANCELLED") throw Conflict("Order already cancelled");
    if (!ctx.actor.id) throw BadRequest("Authenticated user required");
    const actorId: string = ctx.actor.id;

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    // Cancel any non-completed procedures
    await tx.procedure.updateMany({
      where: {
        orderId: order.id,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id,
        action: "order.cancel",
        resourceType: "Order",
        resourceId: order.id,
        reason,
        correlationId: ctx.correlationId,
        after: { status: "CANCELLED" } as object,
      },
    });

    return {
      result: updated,
      events: [
        {
          eventName: EVENT_NAMES.ORDER_CANCELLED,
          payload: OrderEvents.OrderCancelledV1Payload.parse({
            order_id: order.id,
            reason,
            cancelled_by: actorId,
          }),
        },
      ],
    };
  });
}
