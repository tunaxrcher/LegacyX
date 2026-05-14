import { Queue } from "bullmq";
import { Prisma, prisma } from "@legacyx/db";
import { config } from "../config";
import { logger } from "../logger";
import { redis } from "../redis";

/**
 * Transactional Outbox Relay.
 *
 * Loop:
 *   1. Claim N PENDING rows atomically (status='CLAIMED').
 *   2. Publish each to the general events queue (job name = event_name).
 *   3. On publish success → status='DISPATCHED'.
 *   4. On publish failure → status='PENDING' with attempts++ and exponential backoff.
 *
 * Crash safety: if the relay dies between claim and publish, a periodic reaper
 * (TODO Phase 4) will reset CLAIMED rows older than 1 min back to PENDING.
 */

const log = logger.child({ component: "outbox-relay" });

export const eventsQueue = new Queue(config.queues.events, {
  connection: redis,
  defaultJobOptions: {
    attempts: config.jobAttempts,
    backoff: { type: "exponential", delay: config.jobBackoffMs },
    removeOnComplete: { count: 1000 },
    removeOnFail: false, // keep failed for DLQ inspection
  },
});

type ClaimedRow = {
  id: string;
  event_id: string;
  event_name: string;
  event_version: string;
  payload: unknown;
  metadata: unknown;
};

async function claimBatch(limit: number): Promise<ClaimedRow[]> {
  // MySQL: SELECT ... FOR UPDATE SKIP LOCKED then UPDATE in same TX.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT id FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= NOW(3)
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `,
    );
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await tx.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { status: "DISPATCHED" /* tentative — see note below */ },
    });

    // Re-read full payload of the claimed batch.
    const full = await tx.outboxEvent.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        eventId: true,
        eventName: true,
        eventVersion: true,
        payload: true,
        metadata: true,
      },
    });

    return full.map((r) => ({
      id: r.id,
      event_id: r.eventId,
      event_name: r.eventName,
      event_version: r.eventVersion,
      payload: r.payload,
      metadata: r.metadata,
    }));
  });
}

/**
 * NOTE on tentative DISPATCHED:
 * We mark DISPATCHED inside the claim TX so concurrent relays won't double-publish.
 * If BullMQ publish then fails, we revert to PENDING with backoff + attempts++.
 * For exactly-once semantics on the consumer side we also rely on processed_events.
 */
async function publishAndConfirm(row: ClaimedRow): Promise<void> {
  try {
    await eventsQueue.add(
      row.event_name,
      { metadata: row.metadata, payload: row.payload },
      { jobId: row.event_id }, // BullMQ dedup
    );
    await prisma.outboxEvent.update({
      where: { id: row.id },
      data: { dispatchedAt: new Date() },
    });
    log.debug({ event_id: row.event_id, event_name: row.event_name }, "dispatched");
  } catch (err) {
    log.error({ err, event_id: row.event_id }, "publish failed; reverting to PENDING");
    await prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        attempts: { increment: 1 },
        lastError: (err as Error).message,
        availableAt: new Date(Date.now() + config.jobBackoffMs * 2),
      },
    });
  }
}

async function relayTick(): Promise<number> {
  const batch = await claimBatch(config.relayBatchSize);
  if (batch.length === 0) return 0;
  log.info({ count: batch.length }, "claimed outbox batch");
  await Promise.all(batch.map(publishAndConfirm));
  return batch.length;
}

let stopFlag = false;

export async function startRelay(): Promise<void> {
  log.info(
    { interval_ms: config.relayIntervalMs, batch_size: config.relayBatchSize },
    "Outbox Relay starting",
  );
  while (!stopFlag) {
    try {
      const n = await relayTick();
      if (n === 0) {
        await sleep(config.relayIntervalMs);
      }
    } catch (err) {
      log.error({ err }, "relayTick crashed; sleeping");
      await sleep(config.relayIntervalMs * 5);
    }
  }
  log.info("Outbox Relay stopped");
}

export function stopRelay() {
  stopFlag = true;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
