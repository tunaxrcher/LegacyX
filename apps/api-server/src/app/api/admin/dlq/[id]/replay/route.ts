import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";
import { ulid } from "ulid";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse, NotFound } from "../../../../../../shared/errors";
import { authorize } from "../../../../../../shared/auth";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Re-queue a DLQ entry by inserting a fresh OutboxEvent row (PENDING).
 * The Relay will pick it up on its next tick.
 *
 * The new event gets a NEW event_id so the consumer can re-run
 * (the original processed_events row is left for audit history).
 */
export async function POST(_req: Request, { params }: Params) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "break_glass",
      action: "approve",
    });

    const dlq = await prisma.deadLetter.findUnique({ where: { id: params.id } });
    if (!dlq || dlq.tenantId !== ctx.tenantId) throw NotFound("DLQ entry not found");
    if (dlq.status !== "NEW") throw NotFound("DLQ entry already actioned");

    const newEventId = ulid();
    await prisma.$transaction([
      prisma.outboxEvent.create({
        data: {
          eventId: newEventId,
          eventName: dlq.eventName,
          eventVersion: (dlq.metadata as { event_version?: string })?.event_version ?? "v1",
          correlationId: (dlq.metadata as { correlation_id?: string })?.correlation_id ?? ctx.correlationId,
          causationId: dlq.eventId,
          tenantId: dlq.tenantId ?? ctx.tenantId,
          branchId: (dlq.metadata as { branch_id?: string })?.branch_id ?? null,
          payload: dlq.payload as object,
          metadata: { ...(dlq.metadata as object), replayed_from: dlq.eventId, replayed_by: ctx.actor.id },
          status: "PENDING",
        },
      }),
      prisma.deadLetter.update({
        where: { id: dlq.id },
        data: {
          status: "REPLAYED",
          reprocessedAt: new Date(),
          reprocessedBy: ctx.actor.id ?? "system",
        },
      }),
    ]);

    return NextResponse.json({
      data: { new_event_id: newEventId, original_event_id: dlq.eventId },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
