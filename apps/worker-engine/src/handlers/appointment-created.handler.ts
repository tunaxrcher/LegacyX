import { prisma } from "@legacyx/db";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "appointment-created" });

/**
 * Reaction to `appointment.created`:
 *   - Insert a NotificationLog row (LINE/SMS confirmation — dispatcher in
 *     Phase 8 actually sends).
 *
 * Room reservation is NOT auto-created here. Rooms are assigned explicitly:
 *   - by reception at check-in (`POST /visits/check-in` with `room_resource_id`),
 *   - or after-the-fact via `assignRoom` on `/visits/<id>`.
 *
 * Auto-picking a placeholder room used to mislead the UI into showing
 * "Treatment Room 1 (legacy)" on every brand-new appointment, even when the
 * receptionist had explicitly skipped room selection.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = AppointmentEvents.AppointmentCreatedV1Payload.parse(env.payload);
  const { tenant_id, branch_id } = env.metadata;
  if (!branch_id) throw new Error("branch_id required for appointment.created handler");

  log.info({ appt: payload.appointment_id, patient: payload.patient_id }, "processing");

  await prisma.notificationLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id,
      channel: payload.channel === "LIFF" || payload.channel === "ONLINE" ? "LINE" : "SMS",
      templateCode: "appointment.confirmed",
      recipientRef: payload.patient_id,
      payload: {
        appointment_id: payload.appointment_id,
        scheduled_at: payload.scheduled_at,
      },
      status: "PENDING",
    },
  });
}

export const appointmentCreatedHandler: Handler = {
  name: "appointment-created.notify",
  eventName: EVENT_NAMES.APPOINTMENT_CREATED,
  run,
};
