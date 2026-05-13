import { z } from "zod";
import { envelope } from "../envelope";

export const EmrSignedV1Payload = z.object({
  emr_id: z.string(),
  version: z.number().int().positive(),
  patient_id: z.string(),
  signed_by: z.string(),
  signed_at: z.string().datetime({ offset: true }),
  content_hash: z.string(),
});
export const EmrSignedV1 = envelope(EmrSignedV1Payload);

export const EmrAmendedV1Payload = z.object({
  emr_id: z.string(),
  new_version: z.number().int().positive(),
  amendment_of: z.number().int().positive(),
  amended_by: z.string(),
  reason: z.string(),
});
export const EmrAmendedV1 = envelope(EmrAmendedV1Payload);
