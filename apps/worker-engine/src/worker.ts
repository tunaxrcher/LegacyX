import { Worker, type Job } from "bullmq";
import { prisma } from "@legacyx/db";
import type { EventMetadata } from "@legacyx/events";
import { config } from "./config";
import { logger } from "./logger";
import { redis } from "./redis";
import { handlerRegistry } from "./handlers";
import { claimProcessing, markFailed, markSuccess } from "./shared/idempotency";
import type { HandlerEnvelope } from "./handlers/types";

const log = logger.child({ component: "worker" });

type JobData = { metadata: EventMetadata; payload: unknown };

async function processJob(job: Job<JobData>) {
  const envelope: HandlerEnvelope = job.data;
  const { event_name, event_id } = envelope.metadata;

  const handlers = handlerRegistry.get(event_name) ?? [];
  if (handlers.length === 0) {
    log.warn({ event_name, event_id }, "no handler registered — acking");
    return;
  }

  for (const h of handlers) {
    const claim = await claimProcessing(event_id, h.name);
    if (claim === "SKIP_DONE") {
      log.debug({ event_id, handler: h.name }, "already SUCCESS — skipping");
      continue;
    }
    try {
      await h.run(envelope);
      await markSuccess(event_id, h.name);
      log.info({ event_id, event_name, handler: h.name }, "handler ok");
    } catch (err) {
      await markFailed(event_id, h.name, err);
      log.error({ err, event_id, handler: h.name }, "handler failed");
      throw err; // let BullMQ retry / DLQ
    }
  }
}

export function startWorker() {
  const worker = new Worker<JobData>(config.queues.events, processJob, {
    connection: redis,
    concurrency: config.workerConcurrency,
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id }, "job completed");
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const remaining = (job.opts.attempts ?? 1) - (job.attemptsMade ?? 0);
    log.warn(
      { jobId: job.id, attempts: job.attemptsMade, remaining, err: err.message },
      "job failed",
    );
    if (remaining > 0) return; // BullMQ will retry

    // Exhausted → write to DLQ
    const data = job.data;
    try {
      await prisma.deadLetter.create({
        data: {
          tenantId: data.metadata.tenant_id,
          queueName: config.queues.events,
          eventName: data.metadata.event_name,
          eventId: data.metadata.event_id,
          payload: data.payload as object,
          metadata: data.metadata as unknown as object,
          error: err.message?.slice(0, 1000) ?? "unknown",
          attempts: job.attemptsMade ?? 0,
          status: "NEW",
        },
      });
      log.error(
        { event_id: data.metadata.event_id, event_name: data.metadata.event_name },
        "moved to DLQ",
      );
    } catch (e) {
      log.error({ err: e }, "failed to write DLQ row");
    }
  });

  log.info({ queue: config.queues.events, concurrency: config.workerConcurrency }, "Worker started");
  return worker;
}
