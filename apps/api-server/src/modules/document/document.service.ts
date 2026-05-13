import { z } from "zod";
import { PaymentEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export const RequestDocumentDto = z.object({
  type: z.enum([
    "CONSENT",
    "MEDICAL_CERT",
    "E_RECEIPT",
    "TAX_INVOICE",
    "PRESCRIPTION",
    "REPORT",
    "OTHER",
  ]),
  template_code: z.string().min(1),
  template_version: z.string().default("v1"),
  ref_type: z.string().optional(),
  ref_id: z.string().optional(),
  data: z.record(z.unknown()).default({}),
});

export async function requestDocument(
  ctx: RequestContext,
  input: z.infer<typeof RequestDocumentDto>,
) {
  await authorize(ctx, {
    resource: "patient",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        type: input.type,
        refType: input.ref_type,
        refId: input.ref_id,
        templateCode: input.template_code,
        templateVersion: input.template_version,
        storageKey: "",
        contentHash: "",
        status: "REQUESTED",
        generatedBy: actorId,
      },
    });

    return {
      result: doc,
      events: [
        {
          eventName: EVENT_NAMES.DOCUMENT_REQUESTED,
          payload: PaymentEvents.DocumentRequestedV1Payload.parse({
            document_id: doc.id,
            type: input.type,
            template_code: input.template_code,
            template_version: input.template_version,
            ref_type: input.ref_type,
            ref_id: input.ref_id,
            data: input.data,
          }),
        },
      ],
    };
  });
}
