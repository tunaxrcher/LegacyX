import { Prisma, prisma } from "@legacyx/db";
import { buildEnvelope, type EventName, type EventVersion } from "@legacyx/events";
import { ulid } from "ulid";
import type { RequestContext } from "./context";

export type OutboxEventInput = {
  eventName: EventName | string;
  version?: EventVersion;
  payload: unknown;
  causationId?: string;
};

/**
 * Run a DB transaction AND emit one-or-more outbox events atomically.
 *
 * Usage:
 *   const result = await writeWithOutbox(ctx, async (tx) => {
 *     const appt = await tx.appointment.create({ data: ... });
 *     return {
 *       result: appt,
 *       events: [{
 *         eventName: "appointment.created",
 *         payload: { appointment_id: appt.id, ... }
 *       }]
 *     };
 *   });
 *
 * The Relay worker (Phase 3) picks up rows with status=PENDING and publishes
 * them to BullMQ. Until then, rows just accumulate in the outbox_events table.
 */
export async function writeWithOutbox<T>(
  ctx: RequestContext,
  fn: (tx: Prisma.TransactionClient) => Promise<{ result: T; events: OutboxEventInput[] }>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const { result, events } = await fn(tx);

    for (const e of events) {
      const eventId = ulid();
      const envelope = buildEnvelope({
        eventName: e.eventName,
        version: e.version ?? "v1",
        payload: e.payload,
        ctx: {
          eventId,
          correlationId: ctx.correlationId,
          causationId: e.causationId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          actor: ctx.actor,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventId,
          eventName: envelope.metadata.event_name,
          eventVersion: envelope.metadata.event_version,
          correlationId: envelope.metadata.correlation_id,
          causationId: envelope.metadata.causation_id,
          tenantId: envelope.metadata.tenant_id,
          branchId: envelope.metadata.branch_id,
          payload: envelope.payload as Prisma.InputJsonValue,
          metadata: envelope.metadata as unknown as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });
    }

    return result;
  });
}
