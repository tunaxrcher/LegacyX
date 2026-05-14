import { z } from "zod";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";
import { autoReleaseForAppointment } from "../resource/resource.service";

export const CheckInDto = z.object({
  appointment_id: z.string().min(1),
  room_resource_id: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type CheckInInput = z.infer<typeof CheckInDto>;

export async function checkInAppointment(ctx: RequestContext, input: CheckInInput) {
  if (!ctx.branchId) throw BadRequest("Branch context required (x-branch-id)");
  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const appt = await tx.appointment.findFirst({
      where: { id: input.appointment_id, tenantId: ctx.tenantId, branchId: ctx.branchId! },
    });
    if (!appt) throw NotFound(`Appointment ${input.appointment_id} not found`);
    if (appt.status !== "BOOKED" && appt.status !== "CONFIRMED") {
      throw Conflict(`Cannot check in appointment in status ${appt.status}`);
    }

    // Prevent duplicate visits for the same appointment
    const existing = await tx.visit.findFirst({
      where: { appointmentId: appt.id, tenantId: ctx.tenantId },
    });
    if (existing) throw Conflict("Visit already exists for this appointment");

    const now = new Date();
    const visit = await tx.visit.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        patientId: appt.patientId,
        appointmentId: appt.id,
        status: "OPEN",
        checkedInAt: now,
      },
    });

    await tx.appointment.update({
      where: { id: appt.id },
      data: { status: "CHECKED_IN" },
    });

    // Release any pre-existing HELD reservations on this appointment (e.g.
    // from older worker logic that auto-HELD a placeholder room). Without
    // this, a check-in without explicit room selection would still display
    // a stale "currentRoom" badge in the UI.
    await tx.resourceReservation.updateMany({
      where: {
        tenantId: ctx.tenantId,
        appointmentId: appt.id,
        status: "HELD",
      },
      data: { status: "RELEASED" },
    });

    // Create a CONFIRMED reservation only when the receptionist explicitly
    // picked a room.
    if (input.room_resource_id) {
      const res = await tx.resource.findFirst({
        where: {
          id: input.room_resource_id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId!,
          deletedAt: null,
        },
      });
      if (!res) throw NotFound(`Resource ${input.room_resource_id} not found`);
      if (res.status === "MAINTENANCE" || res.status === "RETIRED") {
        throw Conflict(`Resource is ${res.status}`);
      }
      const ends = new Date(now.getTime() + (appt.durationMin ?? 30) * 60_000);
      await tx.resourceReservation.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId!,
          resourceId: res.id,
          appointmentId: appt.id,
          startsAt: now,
          endsAt: ends,
          status: "CONFIRMED",
        },
      });
    }

    // Audit trail
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actor.id,
        action: "visit.check_in",
        resourceType: "Visit",
        resourceId: visit.id,
        branchId: ctx.branchId,
        correlationId: ctx.correlationId,
        after: { appointmentId: appt.id, notes: input.notes ?? null } as object,
      },
    });

    return {
      result: visit,
      events: [
        {
          eventName: EVENT_NAMES.VISIT_CHECKED_IN,
          payload: AppointmentEvents.VisitCheckedInV1Payload.parse({
            visit_id: visit.id,
            appointment_id: appt.id,
            patient_id: visit.patientId,
            branch_id: visit.branchId,
            checked_in_at: (visit.checkedInAt ?? now).toISOString(),
          }),
        },
      ],
    };
  });
}

export const AssignRoomDto = z.object({
  room_resource_id: z.string().min(1),
  reason: z.string().max(500).optional(),
});
export type AssignRoomInput = z.infer<typeof AssignRoomDto>;

/**
 * Move a visit into a (different) room.
 *
 *   - If the visit currently has no active reservation: create a fresh
 *     CONFIRMED reservation for the supplied room and flip its status to
 *     OCCUPIED. Used when reception checked in without picking a room.
 *   - If the visit already occupies a room: close the previous reservation
 *     (CONSUMED) and free the previous resource, then create a new
 *     reservation for the new room. Used for inter-room transfers.
 *
 * The destination room must be AVAILABLE (or already assigned to this visit
 * — caller is allowed to "re-confirm" the same room).
 */
export async function assignRoom(
  ctx: RequestContext,
  visitId: string,
  input: AssignRoomInput,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required (x-branch-id)");
  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id: visitId, tenantId: ctx.tenantId, branchId: ctx.branchId! },
    });
    if (!visit) throw NotFound(`Visit ${visitId} not found`);
    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw Conflict(`Cannot assign room to a ${visit.status} visit`);
    }
    if (!visit.appointmentId) {
      throw BadRequest("Visit has no appointment (cannot reserve a room)");
    }

    const room = await tx.resource.findFirst({
      where: {
        id: input.room_resource_id,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        deletedAt: null,
      },
    });
    if (!room) throw NotFound(`Resource ${input.room_resource_id} not found`);
    if (room.status === "MAINTENANCE" || room.status === "RETIRED") {
      throw Conflict(`Resource is ${room.status}`);
    }

    // Close the previous reservation if there is one and free its resource.
    const prev = await tx.resourceReservation.findFirst({
      where: {
        appointmentId: visit.appointmentId,
        status: { in: ["HELD", "CONFIRMED"] },
      },
    });
    const now = new Date();
    if (prev && prev.resourceId !== input.room_resource_id) {
      await tx.resourceReservation.update({
        where: { id: prev.id },
        data: { status: "CONSUMED", endsAt: now },
      });
      await tx.resource.updateMany({
        where: { id: prev.resourceId, status: "OCCUPIED" },
        data: { status: "AVAILABLE" },
      });
    }

    // No-op if the request was for the same room and a reservation exists.
    if (prev && prev.resourceId === input.room_resource_id) {
      return {
        result: {
          visitId,
          resourceId: prev.resourceId,
          reused: true,
          transferred: false,
        },
        events: [],
      };
    }

    // Verify the new room isn't already occupied by someone else.
    if (room.status === "OCCUPIED") {
      const someone = await tx.resourceReservation.findFirst({
        where: {
          resourceId: room.id,
          status: { in: ["HELD", "CONFIRMED"] },
        },
      });
      if (someone && someone.appointmentId !== visit.appointmentId) {
        throw Conflict("Selected room is currently occupied");
      }
    }

    const ends = new Date(now.getTime() + 60 * 60_000); // default 60 min hold
    await tx.resourceReservation.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        resourceId: room.id,
        appointmentId: visit.appointmentId,
        startsAt: now,
        endsAt: ends,
        status: "CONFIRMED",
      },
    });
    await tx.resource.update({
      where: { id: room.id },
      data: { status: "OCCUPIED" },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? null,
        action: prev ? "visit.transfer_room" : "visit.assign_room",
        resourceType: "Visit",
        resourceId: visit.id,
        correlationId: ctx.correlationId,
        reason: input.reason ?? null,
        before: prev ? { resourceId: prev.resourceId } : undefined,
        after: { resourceId: room.id },
      },
    });

    return {
      result: { visitId, resourceId: room.id, transferred: !!prev, reused: false },
      events: [],
    };
  });
}

export async function startVisit(ctx: RequestContext, visitId: string) {
  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  return writeWithOutbox(ctx, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id: visitId, tenantId: ctx.tenantId },
    });
    if (!visit) throw NotFound(`Visit ${visitId} not found`);
    if (visit.status !== "OPEN") throw Conflict(`Visit in status ${visit.status}`);
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    // Keep appointment.status = CHECKED_IN; Visit moves to IN_PROGRESS independently
    return { result: updated, events: [] };
  });
}

/**
 * Mark a visit as completed (patient leaves the clinic).
 * Side effects:
 *   - visit.status = COMPLETED, completedAt = now
 *   - appointment.status = COMPLETED
 *   - any active room/resource reservations attached to this appointment are
 *     marked CONSUMED and the underlying Resource flipped back to AVAILABLE
 *     (so the next patient can be checked into the same room).
 */
export async function completeVisit(ctx: RequestContext, visitId: string) {
  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  return writeWithOutbox(ctx, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id: visitId, tenantId: ctx.tenantId },
    });
    if (!visit) throw NotFound(`Visit ${visitId} not found`);
    if (visit.status === "COMPLETED") {
      throw Conflict("Visit already completed");
    }
    const now = new Date();
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { status: "COMPLETED", completedAt: now },
    });

    if (visit.appointmentId) {
      await tx.appointment.updateMany({
        where: { id: visit.appointmentId, tenantId: ctx.tenantId },
        data: { status: "COMPLETED" },
      });

      await autoReleaseForAppointment(tx, visit.appointmentId);
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actor.id,
        action: "visit.complete",
        resourceType: "Visit",
        resourceId: visit.id,
        branchId: ctx.branchId,
        correlationId: ctx.correlationId,
      },
    });

    return { result: updated, events: [] };
  });
}
