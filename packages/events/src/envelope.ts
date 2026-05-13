import { z } from "zod";
import type { EventName } from "./dictionary";

export const EventVersionSchema = z.enum(["v1", "v2"]);
export type EventVersion = z.infer<typeof EventVersionSchema>;

export const ActorSchema = z.object({
  type: z.enum(["USER", "SYSTEM", "PATIENT", "AI"]),
  id: z.string().nullable(),
});
export type Actor = z.infer<typeof ActorSchema>;

export const EventMetadataSchema = z.object({
  event_name: z.string(),
  event_version: EventVersionSchema,
  event_id: z.string().min(1), // ULID/UUID — idempotency key
  correlation_id: z.string().min(1),
  causation_id: z.string().optional(),
  timestamp: z.string().datetime({ offset: true }),
  tenant_id: z.string().min(1),
  branch_id: z.string().optional(),
  actor: ActorSchema,
});
export type EventMetadata = z.infer<typeof EventMetadataSchema>;

export const envelope = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    metadata: EventMetadataSchema,
    payload,
  });

export type EventEnvelope<TPayload> = {
  metadata: EventMetadata;
  payload: TPayload;
};

/** Build envelope with sensible defaults. Used by api-server's outbox writer. */
export function buildEnvelope<TPayload>(args: {
  eventName: EventName | string;
  version?: EventVersion;
  payload: TPayload;
  ctx: {
    eventId: string; // pre-generated ULID
    correlationId: string;
    causationId?: string;
    tenantId: string;
    branchId?: string;
    actor: Actor;
    timestamp?: Date;
  };
}): EventEnvelope<TPayload> {
  return {
    metadata: {
      event_name: args.eventName,
      event_version: args.version ?? "v1",
      event_id: args.ctx.eventId,
      correlation_id: args.ctx.correlationId,
      causation_id: args.ctx.causationId,
      timestamp: (args.ctx.timestamp ?? new Date()).toISOString(),
      tenant_id: args.ctx.tenantId,
      branch_id: args.ctx.branchId,
      actor: args.ctx.actor,
    },
    payload: args.payload,
  };
}
