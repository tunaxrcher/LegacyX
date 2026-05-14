import { prisma } from "@legacyx/db";
import { EodEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "shift-closed" });

const ALERT_THRESHOLD = Number(process.env.SHIFT_VARIANCE_ALERT ?? 100);

/**
 * Reaction to `shift.closed`:
 *   - Audit-log the close event with the variance amount.
 *   - If |variance| > threshold, also enqueue a notification for the manager
 *     (delivered by Phase 8 Notification Layer; for now lands in
 *     NotificationLog as PENDING).
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = EodEvents.ShiftClosedV1Payload.parse(env.payload);
  const { tenant_id, branch_id, correlation_id } = env.metadata;

  await prisma.auditLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id ?? payload.branch_id,
      actorUserId: payload.closed_by,
      action: "shift.close.processed",
      resourceType: "Shift",
      resourceId: payload.shift_id,
      correlationId: correlation_id,
      after: {
        cash_opening: payload.cash_opening,
        cash_counted: payload.cash_counted,
        cash_expected: payload.cash_expected,
        variance: payload.variance,
        payments_count: payload.payments_count,
      } as object,
    },
  });

  const variance = Math.abs(Number(payload.variance));
  if (variance > ALERT_THRESHOLD) {
    log.warn(
      { shift_id: payload.shift_id, variance: payload.variance },
      "variance over threshold — alert queued",
    );
    await prisma.notificationLog.create({
      data: {
        tenantId: tenant_id,
        branchId: branch_id ?? payload.branch_id,
        channel: "EMAIL",
        templateCode: "shift.variance_alert",
        recipientRef: "manager",
        payload: {
          shift_id: payload.shift_id,
          branch_id: payload.branch_id,
          variance: payload.variance,
          cash_counted: payload.cash_counted,
          cash_expected: payload.cash_expected,
        },
        status: "PENDING",
      },
    });
  }

  log.info(
    { shift_id: payload.shift_id, variance: payload.variance },
    "shift closed processed",
  );
}

export const shiftClosedHandler: Handler = {
  name: "shift-closed.audit+alert",
  eventName: EVENT_NAMES.SHIFT_CLOSED,
  run,
};
