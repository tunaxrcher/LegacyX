import { z } from "zod";
import { prisma } from "@legacyx/db";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { NotFound, BadRequest } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export const CreateAppointmentDto = z.object({
  patient_id: z.string().min(1),
  doctor_id: z.string().optional(),
  service_id: z.string().optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  // Slot length used for conflict detection. Auto-derived from `service_id`
  // when present, otherwise defaults to 30 minutes.
  duration_min: z.number().int().positive().max(8 * 60).optional(),
  channel: z.enum(["WALKIN", "ONLINE", "LIFF", "PHONE"]).default("WALKIN"),
  reason: z.string().max(2000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentDto>;

export async function createAppointment(
  ctx: RequestContext,
  input: CreateAppointmentInput,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required (x-branch-id)");

  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  // Auto-derive duration from service if not explicitly provided.
  let durationMin = input.duration_min ?? 30;
  let serviceLabel: string | undefined;
  if (input.service_id) {
    const svc = await prisma.service.findFirst({
      where: { id: input.service_id, tenantId: ctx.tenantId },
      select: { id: true, name: true, nameTh: true, durationMin: true },
    });
    if (!svc) throw NotFound(`Service ${input.service_id} not found`);
    if (input.duration_min == null) durationMin = svc.durationMin;
    serviceLabel = svc.nameTh ?? svc.name;
  }

  return writeWithOutbox(ctx, async (tx) => {
    // Confirm patient belongs to this tenant.
    const patient = await tx.patient.findFirst({
      where: { id: input.patient_id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);
    if (patient.status !== "ACTIVE") throw BadRequest("Patient is not active");

    // If a doctor was supplied, verify they're an active staff member of
    // this tenant. Reception sometimes leaves doctor unassigned (will be
    // filled at check-in), so a missing doctor_id is allowed.
    if (input.doctor_id) {
      const doctor = await tx.user.findFirst({
        where: {
          id: input.doctor_id,
          tenantId: ctx.tenantId,
          status: "ACTIVE",
        },
        select: { id: true, primaryRoleCode: true },
      });
      if (!doctor) throw NotFound(`Doctor ${input.doctor_id} not found`);
      if (doctor.primaryRoleCode !== "DOCTOR") {
        throw BadRequest("Selected user is not a doctor");
      }
    }

    const reasonWithService = serviceLabel
      ? input.reason
        ? `${serviceLabel} — ${input.reason}`
        : serviceLabel
      : input.reason;

    const appt = await tx.appointment.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        patientId: input.patient_id,
        doctorId: input.doctor_id,
        scheduledAt: new Date(input.scheduled_at),
        durationMin,
        channel: input.channel,
        reason: reasonWithService,
        status: "BOOKED",
      },
    });

    return {
      result: appt,
      events: [
        {
          eventName: EVENT_NAMES.APPOINTMENT_CREATED,
          payload: AppointmentEvents.AppointmentCreatedV1Payload.parse({
            appointment_id: appt.id,
            patient_id: appt.patientId,
            doctor_id: appt.doctorId ?? undefined,
            scheduled_at: appt.scheduledAt.toISOString(),
            duration_min: appt.durationMin,
            channel: appt.channel,
          }),
        },
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Edit / Cancel
// ---------------------------------------------------------------------------

export const UpdateAppointmentDto = z.object({
  doctor_id: z.string().nullable().optional(),
  service_id: z.string().nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  duration_min: z.number().int().positive().max(8 * 60).optional(),
  reason: z.string().max(2000).nullable().optional(),
});
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentDto>;

export async function updateAppointment(
  ctx: RequestContext,
  appointmentId: string,
  input: UpdateAppointmentInput,
) {
  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId },
    select: { id: true, status: true, scheduledAt: true },
  });
  if (!existing) throw NotFound(`Appointment ${appointmentId} not found`);
  if (existing.status !== "BOOKED") {
    throw BadRequest(
      `Only BOOKED appointments may be edited (current status: ${existing.status})`,
    );
  }

  // Resolve service for label + duration auto-fill, mirroring create flow.
  let durationMin: number | undefined;
  let serviceLabel: string | undefined | null;
  if (input.service_id !== undefined) {
    if (input.service_id) {
      const svc = await prisma.service.findFirst({
        where: { id: input.service_id, tenantId: ctx.tenantId },
        select: { id: true, name: true, nameTh: true, durationMin: true },
      });
      if (!svc) throw NotFound(`Service ${input.service_id} not found`);
      serviceLabel = svc.nameTh ?? svc.name;
      if (input.duration_min == null) durationMin = svc.durationMin;
    } else {
      serviceLabel = null;
    }
  }
  if (input.duration_min != null) durationMin = input.duration_min;

  if (input.doctor_id) {
    const doc = await prisma.user.findFirst({
      where: { id: input.doctor_id, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, primaryRoleCode: true },
    });
    if (!doc) throw NotFound(`Doctor ${input.doctor_id} not found`);
    if (doc.primaryRoleCode !== "DOCTOR") {
      throw BadRequest("Selected user is not a doctor");
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      ...(input.doctor_id !== undefined && { doctorId: input.doctor_id }),
      ...(input.scheduled_at !== undefined && {
        scheduledAt: new Date(input.scheduled_at),
      }),
      ...(durationMin !== undefined && { durationMin }),
      ...(input.reason !== undefined && {
        reason:
          serviceLabel === null
            ? input.reason
            : serviceLabel
              ? input.reason
                ? `${serviceLabel} — ${input.reason}`
                : serviceLabel
              : input.reason,
      }),
    },
  });

  return updated;
}

export const CancelAppointmentDto = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "reason must be at least 3 characters")
    .max(500),
});
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentDto>;

export async function cancelAppointment(
  ctx: RequestContext,
  appointmentId: string,
  input: CancelAppointmentInput,
) {
  await authorize(ctx, {
    resource: "appointment",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId },
    select: { id: true, status: true, reason: true, patientId: true },
  });
  if (!existing) throw NotFound(`Appointment ${appointmentId} not found`);
  if (existing.status === "CANCELLED") {
    throw BadRequest("Appointment is already cancelled");
  }
  if (existing.status === "COMPLETED") {
    throw BadRequest("Completed appointments cannot be cancelled");
  }

  const note = `[CANCELLED] ${input.reason}${
    existing.reason ? ` · prior: ${existing.reason}` : ""
  }`;

  return writeWithOutbox(ctx, async (tx) => {
    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "CANCELLED",
        reason: note.slice(0, 2000),
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId ?? null,
        actorUserId: ctx.actor.id ?? null,
        action: "appointment.cancel",
        resourceType: "Appointment",
        resourceId: appointmentId,
        correlationId: ctx.correlationId,
        reason: input.reason,
        after: { status: "CANCELLED" },
      },
    });
    return {
      result: updated,
      events: [
        {
          eventName: EVENT_NAMES.APPOINTMENT_CANCELLED,
          payload: AppointmentEvents.AppointmentCancelledV1Payload.parse({
            appointment_id: appointmentId,
            reason: input.reason,
          }),
        },
      ],
    };
  });
}
