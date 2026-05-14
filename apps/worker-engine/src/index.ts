import { logger } from "./logger";
import { startRelay, stopRelay, eventsQueue } from "./relay/outbox-relay";
import { startWorker } from "./worker";
import { redis } from "./redis";
import { dispatchTick, NOTIFICATION_TICK_MS } from "./notification/dispatcher";
import { runCrmCron, CRM_CRON_TICK_MS } from "./cron/crm-cron";
import {
  startMetricsServer,
  stopMetricsServer,
  queueDepth,
  outboxPending,
  dlqDepth,
} from "./metrics";
import { prisma } from "@legacyx/db";

async function main() {
  logger.info({ pid: process.pid }, "🚀 LegacyX worker-engine starting");

  // Phase 9 — metrics + health server.
  startMetricsServer();

  const worker = startWorker();

  // Relay loop runs alongside the worker.
  const relayPromise = startRelay();

  // Phase 9 — refresh gauge metrics every 15s.
  const metricsTimer = setInterval(() => {
    void (async () => {
      try {
        const [waiting, active, pending, dlq] = await Promise.all([
          eventsQueue.getWaitingCount(),
          eventsQueue.getActiveCount(),
          prisma.outboxEvent.count({ where: { status: "PENDING" } }),
          prisma.deadLetter.count({ where: { status: "NEW" } }),
        ]);
        queueDepth.set(waiting + active, { state: "all" });
        queueDepth.set(waiting, { state: "waiting" });
        queueDepth.set(active, { state: "active" });
        outboxPending.set(pending);
        dlqDepth.set(dlq);
      } catch (err) {
        logger.warn({ err }, "metrics refresh failed");
      }
    })();
  }, 15_000);
  metricsTimer.unref();

  // Phase 8 — notification dispatcher tick. Drains PENDING NotificationLog rows
  // through the configured providers (LINE / SMS / EMAIL).
  const notifTimer = setInterval(() => {
    void dispatchTick().catch((err) =>
      logger.error({ err, component: "notification-dispatcher" }, "tick error"),
    );
  }, NOTIFICATION_TICK_MS);
  notifTimer.unref();
  logger.info(
    { component: "notification-dispatcher", tickMs: NOTIFICATION_TICK_MS },
    "Notification dispatcher started",
  );

  // Phase 8 — CRM cron tick. Sweeps for review/rebooking/wallet/birthday and
  // enqueues notification rows.
  const cronTimer = setInterval(() => {
    void runCrmCron().catch((err) =>
      logger.error({ err, component: "crm-cron" }, "cron error"),
    );
  }, CRM_CRON_TICK_MS);
  cronTimer.unref();
  logger.info(
    { component: "crm-cron", tickMs: CRM_CRON_TICK_MS },
    "CRM cron started",
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    clearInterval(notifTimer);
    clearInterval(cronTimer);
    clearInterval(metricsTimer);
    stopRelay();
    await worker.close();
    await eventsQueue.close();
    await redis.quit();
    await stopMetricsServer();
    await relayPromise;
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
