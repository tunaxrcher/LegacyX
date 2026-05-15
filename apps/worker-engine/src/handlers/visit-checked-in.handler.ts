import { prisma } from "@legacyx/db";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "visit-checked-in" });

/**
 * Reaction to `visit.checked_in`:
 *   - Look up branch + (optional) assigned room and doctor for friendly UI.
 *   - Insert a `NotificationLog` row so the patient gets a "You're checked in"
 *     message via LINE/SMS (channel picked from the patient's binding).
 *
 * Idempotency: the worker shell uses `claimProcessing()` against
 * `ProcessedEvent` per `(event_id, handler.name)` — re-deliveries are safe.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = AppointmentEvents.VisitCheckedInV1Payload.parse(env.payload);
  const { tenant_id, branch_id } = env.metadata;

  log.info(
    { visit: payload.visit_id, patient: payload.patient_id },
    "processing check-in",
  );

  // Look up branch name (best-effort).
  const branch = await prisma.branch.findFirst({
    where: { id: payload.branch_id, tenantId: tenant_id },
    select: { name: true },
  });

  // Look up the assigned room (if any) — most recent CONFIRMED reservation
  // attached to the appointment.
  let roomName: string | null = null;
  let doctorName: string | null = null;
  if (payload.appointment_id) {
    const reservation = await prisma.resourceReservation.findFirst({
      where: {
        tenantId: tenant_id,
        appointmentId: payload.appointment_id,
        status: "CONFIRMED",
      },
      orderBy: { createdAt: "desc" },
      include: { resource: { select: { name: true } } },
    });
    roomName = reservation?.resource?.name ?? null;

    const appt = await prisma.appointment.findFirst({
      where: { id: payload.appointment_id, tenantId: tenant_id },
      select: { doctorId: true },
    });
    if (appt?.doctorId) {
      const doc = await prisma.user.findFirst({
        where: { id: appt.doctorId, tenantId: tenant_id },
        select: { fullName: true },
      });
      doctorName = doc?.fullName ?? null;
    }
  }

  await prisma.notificationLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id ?? payload.branch_id,
      // We pick LINE optimistically; the dispatcher will fall back / fail
      // permanently if the patient hasn't linked LINE. (Future enhancement:
      // resolve per-patient preferred channel before insert.)
      channel: "LINE",
      templateCode: "visit.checkedin",
      recipientRef: payload.patient_id,
      payload: {
        visit_id: payload.visit_id,
        appointment_id: payload.appointment_id ?? null,
        checked_in_at: payload.checked_in_at,
        branch_name: branch?.name ?? null,
        room_name: roomName,
        doctor_name: doctorName,
        locale: "th",
      },
      status: "PENDING",
    },
  });
}

export const visitCheckedInHandler: Handler = {
  name: "visit-checked-in.notify",
  eventName: EVENT_NAMES.VISIT_CHECKED_IN,
  run,
};
