import { prisma } from "@legacyx/db";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "appointment-created" });

/**
 * Reaction to `appointment.created`:
 *   1. Insert a NotificationLog row (LINE confirmation — Phase 4 will actually send).
 *   2. Insert/upgrade ResourceReservation (HELD) for the appointment window.
 *      For now we pick the first available ROOM in the branch as a placeholder.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = AppointmentEvents.AppointmentCreatedV1Payload.parse(env.payload);
  const { tenant_id, branch_id } = env.metadata;
  if (!branch_id) throw new Error("branch_id required for appointment.created handler");

  log.info({ appt: payload.appointment_id, patient: payload.patient_id }, "processing");

  // 1) Notification — enqueue as PENDING (real channel send will be Phase 4)
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

  // 2) Resource Reservation — pick a free ROOM
  const room = await prisma.resource.findFirst({
    where: { tenantId: tenant_id, branchId: branch_id, type: "ROOM", status: "AVAILABLE" },
    orderBy: { code: "asc" },
  });
  if (room) {
    const startsAt = new Date(payload.scheduled_at);
    const endsAt = new Date(startsAt.getTime() + payload.duration_min * 60_000);
    await prisma.resourceReservation.create({
      data: {
        tenantId: tenant_id,
        branchId: branch_id,
        resourceId: room.id,
        appointmentId: payload.appointment_id,
        startsAt,
        endsAt,
        status: "HELD",
      },
    });
    log.info({ resource: room.code, appt: payload.appointment_id }, "reserved");
  } else {
    log.warn({ branch_id }, "no AVAILABLE ROOM resource to reserve");
  }
}

export const appointmentCreatedHandler: Handler = {
  name: "appointment-created.reserve+notify",
  eventName: EVENT_NAMES.APPOINTMENT_CREATED,
  run,
};
