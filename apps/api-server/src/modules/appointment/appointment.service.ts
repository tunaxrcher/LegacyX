import { z } from "zod";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { NotFound, BadRequest } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export const CreateAppointmentDto = z.object({
  patient_id: z.string().min(1),
  doctor_id: z.string().optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_min: z.number().int().positive().max(8 * 60).default(30),
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

  return writeWithOutbox(ctx, async (tx) => {
    // Confirm patient belongs to this tenant.
    const patient = await tx.patient.findFirst({
      where: { id: input.patient_id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);
    if (patient.status !== "ACTIVE") throw BadRequest("Patient is not active");

    const appt = await tx.appointment.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        patientId: input.patient_id,
        doctorId: input.doctor_id,
        scheduledAt: new Date(input.scheduled_at),
        durationMin: input.duration_min,
        channel: input.channel,
        reason: input.reason,
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
