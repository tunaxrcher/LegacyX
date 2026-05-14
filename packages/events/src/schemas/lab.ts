import { z } from "zod";
import { envelope } from "../envelope";

/**
 * Phase M — Lab Orders & Results.
 *
 * `lab.ordered` is emitted when a doctor places a lab order (CBC, LIPID, ...).
 * Downstream this drives the nurse's "samples to collect" worklist and lets
 * external lab integrations (LIS) pick up the order via the same event.
 *
 * `lab.resulted` is emitted when a result is recorded against the order. The
 * payload carries the storage key for the PDF/CSV report (if any) so a
 * worker can deliver it to the patient via LINE/email per their preference.
 */

export const LabOrderedV1Payload = z.object({
  lab_order_id: z.string(),
  patient_id: z.string(),
  visit_id: z.string(),
  ordered_by: z.string(),
  panel: z.string(),
  notes: z.string().optional(),
});
export const LabOrderedV1 = envelope(LabOrderedV1Payload);

export const LabResultedV1Payload = z.object({
  lab_order_id: z.string(),
  lab_result_id: z.string(),
  patient_id: z.string(),
  panel: z.string(),
  resulted_by: z.string().optional(),
  resulted_at: z.string().datetime({ offset: true }),
  /// `payload` carries the structured numeric / textual readings (e.g.
  /// {"WBC": "7.4 x10^9/L"}). Keeping it free-form lets any LIS feed in.
  payload: z.record(z.unknown()),
  /// Optional storage key (S3) of the original PDF/CSV report.
  file_key: z.string().optional(),
});
export const LabResultedV1 = envelope(LabResultedV1Payload);
