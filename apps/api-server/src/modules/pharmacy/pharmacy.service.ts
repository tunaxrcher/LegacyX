import { z } from "zod";
import { Prisma, prisma } from "@legacyx/db";
import { EVENT_NAMES } from "@legacyx/events";
import {
  BadRequest,
  Conflict,
  NotFound,
} from "../../shared/errors";
import { authorize } from "../../shared/auth";
import { writeWithOutbox } from "../../shared/outbox";
import type { RequestContext } from "../../shared/context";

export const DispenseOrderDto = z.object({
  order_id: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

/**
 * Return all orders in the active branch that have at least one MEDICATION
 * line, along with their current dispense status. Used for the pharmacy
 * dispense queue.
 */
export async function listPharmacyQueue(ctx: RequestContext) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "pharmacy",
    action: "dispense",
    target: { branchId: ctx.branchId },
  });

  // Orders with at least one MEDICATION line, not yet cancelled.
  const orders = await prisma.order.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      status: { in: ["CREATED", "CONFIRMED", "FULFILLED"] },
      items: { some: { itemType: "MEDICATION" } },
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) return [];

  // Resolve patient names
  const patientIds = Array.from(new Set(orders.map((o) => o.patientId)));
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    select: { id: true, hn: true, firstName: true, lastName: true },
  });
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  // Existing dispenses
  const dispenses = await prisma.pharmacyDispense.findMany({
    where: { orderId: { in: orders.map((o) => o.id) } },
    orderBy: { createdAt: "desc" },
  });
  const dispenseByOrder = new Map<string, (typeof dispenses)[number]>();
  for (const d of dispenses) {
    if (!dispenseByOrder.has(d.orderId)) dispenseByOrder.set(d.orderId, d);
  }

  return orders.map((o) => {
    const medications = o.items
      .filter((i) => i.itemType === "MEDICATION")
      .map((i) => ({
        id: i.id,
        refId: i.refId,
        description: i.description,
        qty: i.qty.toString(),
        unit: (i.metadata as { unit?: string } | null)?.unit ?? null,
      }));
    const d = dispenseByOrder.get(o.id);
    return {
      orderId: o.id,
      orderStatus: o.status,
      orderedAt: o.createdAt.toISOString(),
      visitId: o.visitId,
      patient: patientMap.get(o.patientId) ?? null,
      medications,
      dispense: d
        ? {
            id: d.id,
            status: d.status,
            dispensedAt: d.dispensedAt?.toISOString() ?? null,
            notes: d.notes ?? null,
          }
        : null,
    };
  });
}

/**
 * Dispense an order: deduct stock for each MEDICATION line (immutable ledger),
 * create a PharmacyDispense row with status DISPENSED, audit & emit event.
 *
 * Idempotent guard: a second DISPENSED row for the same order throws Conflict.
 */
export async function dispenseOrder(
  ctx: RequestContext,
  input: z.infer<typeof DispenseOrderDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "pharmacy",
    action: "dispense",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: input.order_id,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
      },
      include: { items: true },
    });
    if (!order) throw NotFound(`Order ${input.order_id} not found`);
    if (order.status === "CANCELLED") {
      throw Conflict("Order is cancelled");
    }

    // Idempotent: refuse if already dispensed
    const existing = await tx.pharmacyDispense.findFirst({
      where: { orderId: order.id, status: "DISPENSED" },
    });
    if (existing) throw Conflict("Order already dispensed");

    const meds = order.items.filter((i) => i.itemType === "MEDICATION");
    if (meds.length === 0) {
      throw BadRequest("No medication items on this order");
    }

    // Deduct stock for each medication line via stock ledger
    const ledgerIds: string[] = [];
    for (const m of meds) {
      const product = await tx.product.findFirst({
        where: {
          id: m.refId,
          tenantId: ctx.tenantId,
          deletedAt: null,
        },
      });
      if (!product) {
        throw NotFound(`Medication product ${m.refId} not found`);
      }
      if (!product.trackStock) continue; // courses etc. — no deduction

      // Current balance for this branch
      const last = await tx.stockLedger.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId!,
          productId: product.id,
        },
        orderBy: { createdAt: "desc" },
      });
      const currentBalance = last
        ? new Prisma.Decimal(last.balanceAfter)
        : new Prisma.Decimal(0);
      const delta = new Prisma.Decimal(m.qty).negated();
      const balanceAfter = currentBalance.add(delta);
      if (balanceAfter.lt(0)) {
        throw Conflict(
          `Insufficient stock for ${product.sku} (need ${m.qty}, have ${currentBalance})`,
        );
      }
      const ledger = await tx.stockLedger.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId!,
          productId: product.id,
          entryType: "DISPENSE",
          qty: delta,
          balanceAfter,
          refType: "PharmacyDispense",
          refId: order.id,
          notes: `Pharmacy dispense for order ${order.id}`,
          createdBy: actorId,
        },
      });
      ledgerIds.push(ledger.id);
    }

    // Create / update dispense row
    const dispense = await tx.pharmacyDispense.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        orderId: order.id,
        patientId: order.patientId,
        status: "DISPENSED",
        preparedBy: actorId,
        dispensedBy: actorId,
        dispensedAt: new Date(),
        notes: input.notes,
      },
    });

    // Mark the order as FULFILLED if not already (procedures might keep it open;
    // we only flip status if all items have been handled — leave as-is for safety)
    await tx.order.update({
      where: { id: order.id },
      data: { updatedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "pharmacy.dispense",
        resourceType: "Order",
        resourceId: order.id,
        correlationId: ctx.correlationId,
        after: {
          dispense_id: dispense.id,
          ledger_ids: ledgerIds,
          medication_count: meds.length,
        } as object,
      },
    });

    return {
      result: { dispense, ledgerIds, medicationCount: meds.length },
      events: [
        {
          eventName: EVENT_NAMES.PHARMACY_DISPENSED,
          payload: {
            dispense_id: dispense.id,
            order_id: order.id,
            patient_id: order.patientId,
            medication_count: meds.length,
          },
        },
      ],
    };
  });
}
