import { prisma } from "@legacyx/db";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "appointment-cancelled" });

/**
 * Reaction to `appointment.cancelled`:
 *   1. Insert a `NotificationLog` row so the patient gets a "your booking
 *      was cancelled" message via LINE/SMS.
 *   2. Best-effort: clean up any PENDING `appointment.reminder` rows for
 *      this appointment — no point sending a 15-min reminder for a slot the
 *      patient already knows is dead.
 *
 * The schema's `AppointmentCancelledV1Payload` doesn't carry `scheduled_at`
 * or `patient_id`, so we load them from the DB here. (We could expand the
 * payload later, but each emitter then has to remember to fill it — and
 * audit logs already correlate by `appointment_id`.)
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = AppointmentEvents.AppointmentCancelledV1Payload.parse(env.payload);
  const { tenant_id, branch_id } = env.metadata;

  const appt = await prisma.appointment.findFirst({
    where: { id: payload.appointment_id, tenantId: tenant_id },
    select: {
      id: true,
      patientId: true,
      branchId: true,
      scheduledAt: true,
    },
  });
  if (!appt) {
    log.warn({ appt: payload.appointment_id }, "appointment row vanished — skip");
    return;
  }

  // 1. Notify the patient.
  await prisma.notificationLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id ?? appt.branchId,
      channel: "LINE",
      templateCode: "appointment.cancelled",
      recipientRef: appt.patientId,
      payload: {
        appointment_id: appt.id,
        scheduled_at: appt.scheduledAt.toISOString(),
        reason: payload.reason ?? null,
        locale: "th",
      },
      status: "PENDING",
    },
  });

  // 2. Suppress any still-PENDING reminder rows for this cancelled
  //    appointment (saves the patient a confusing 15-min reminder for a
  //    slot they were just told is dead).
  const cancelledCount = await prisma.notificationLog.updateMany({
    where: {
      tenantId: tenant_id,
      templateCode: "appointment.reminder",
      status: "PENDING",
      AND: [
        {
          payload: {
            path: "$.appointment_id",
            equals: appt.id,
          },
        },
      ],
    },
    data: {
      status: "FAILED",
      lastError: "appointment.cancelled — reminder suppressed",
    },
  });

  log.info(
    { appt: appt.id, suppressed_reminders: cancelledCount.count },
    "cancellation processed",
  );
}

export const appointmentCancelledHandler: Handler = {
  name: "appointment-cancelled.notify",
  eventName: EVENT_NAMES.APPOINTMENT_CANCELLED,
  run,
};
