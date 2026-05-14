import { prisma } from "@legacyx/db";
import { EodEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "inventory-reconciled" });

/**
 * Reaction to `inventory.reconciled`:
 *   - Aggregate per-product variances and write a single audit entry with
 *     the totals, including which (if any) Break-Glass override authorised
 *     the change. This gives finance a single row to scan when reviewing
 *     month-end stock health.
 *   - Items with significant negative variance get flagged into
 *     NotificationLog so the manager sees them on the dashboard.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = EodEvents.InventoryReconciledV1Payload.parse(env.payload);
  const { tenant_id, correlation_id } = env.metadata;

  const negativeItems = payload.items.filter((i) => Number(i.variance) < 0);
  const positiveItems = payload.items.filter((i) => Number(i.variance) > 0);
  const matchedCount = payload.items.length - negativeItems.length - positiveItems.length;

  await prisma.auditLog.create({
    data: {
      tenantId: tenant_id,
      branchId: payload.branch_id,
      actorUserId: payload.performed_by,
      action: "inventory.reconcile.processed",
      resourceType: "Branch",
      resourceId: payload.branch_id,
      correlationId: correlation_id,
      after: {
        items: payload.items.length,
        matched: matchedCount,
        positive_variance: positiveItems.length,
        negative_variance: negativeItems.length,
        override_id: payload.override_id ?? null,
      } as object,
    },
  });

  if (negativeItems.length > 0) {
    await prisma.notificationLog.create({
      data: {
        tenantId: tenant_id,
        branchId: payload.branch_id,
        channel: "EMAIL",
        templateCode: "inventory.shrinkage_alert",
        recipientRef: "manager",
        payload: {
          branch_id: payload.branch_id,
          item_count: negativeItems.length,
          items: negativeItems.slice(0, 10),
        },
        status: "PENDING",
      },
    });
  }

  log.info(
    {
      branch: payload.branch_id,
      items: payload.items.length,
      negative: negativeItems.length,
    },
    "reconciliation processed",
  );
}

export const inventoryReconciledHandler: Handler = {
  name: "inventory-reconciled.audit+alert",
  eventName: EVENT_NAMES.INVENTORY_RECONCILED,
  run,
};
