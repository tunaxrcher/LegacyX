import { z } from "zod";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

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

    // Optional: create a 30-min held room reservation
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

      // Auto-release any active reservations on this appointment
      const active = await tx.resourceReservation.findMany({
        where: {
          appointmentId: visit.appointmentId,
          status: { in: ["HELD", "CONFIRMED"] },
        },
      });
      if (active.length > 0) {
        await tx.resourceReservation.updateMany({
          where: { id: { in: active.map((a) => a.id) } },
          data: { status: "CONSUMED", endsAt: now },
        });
        const resourceIds = Array.from(new Set(active.map((a) => a.resourceId)));
        await tx.resource.updateMany({
          where: { id: { in: resourceIds }, status: "OCCUPIED" },
          data: { status: "AVAILABLE" },
        });
      }
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
