import { z } from "zod";
import { envelope } from "../envelope";

export const AppointmentCreatedV1Payload = z.object({
  appointment_id: z.string(),
  patient_id: z.string(),
  doctor_id: z.string().optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_min: z.number().int().positive().default(30),
  channel: z.enum(["WALKIN", "ONLINE", "LIFF", "PHONE"]),
  source: z.string().optional(),
});
export const AppointmentCreatedV1 = envelope(AppointmentCreatedV1Payload);
export type AppointmentCreatedV1Event = z.infer<typeof AppointmentCreatedV1>;

export const AppointmentCancelledV1Payload = z.object({
  appointment_id: z.string(),
  reason: z.string().optional(),
});
export const AppointmentCancelledV1 = envelope(AppointmentCancelledV1Payload);

export const VisitCheckedInV1Payload = z.object({
  visit_id: z.string(),
  appointment_id: z.string().optional(),
  patient_id: z.string(),
  branch_id: z.string(),
  checked_in_at: z.string().datetime({ offset: true }),
});
export const VisitCheckedInV1 = envelope(VisitCheckedInV1Payload);
