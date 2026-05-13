export const config = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:9152",
  logLevel: process.env.LOG_LEVEL ?? "info",

  // Outbox Relay
  relayIntervalMs: Number(process.env.RELAY_INTERVAL_MS ?? 1000),
  relayBatchSize: Number(process.env.RELAY_BATCH_SIZE ?? 50),

  // BullMQ
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  jobAttempts: Number(process.env.JOB_ATTEMPTS ?? 5),
  jobBackoffMs: Number(process.env.JOB_BACKOFF_MS ?? 2000),

  // Queue names
  queues: {
    events: "q.events",
  },
} as const;
