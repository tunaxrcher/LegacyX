import { logger } from "./logger";
import { startRelay, stopRelay, eventsQueue } from "./relay/outbox-relay";
import { startWorker } from "./worker";
import { redis } from "./redis";

async function main() {
  logger.info({ pid: process.pid }, "🚀 LegacyX worker-engine starting");

  const worker = startWorker();

  // Relay loop runs alongside the worker.
  const relayPromise = startRelay();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    stopRelay();
    await worker.close();
    await eventsQueue.close();
    await redis.quit();
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
