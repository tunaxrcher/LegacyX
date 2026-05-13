import IORedis from "ioredis";
import { config } from "./config";

/**
 * Shared Redis connection for BullMQ.
 * BullMQ requires maxRetriesPerRequest=null on the connection used by Workers.
 */
export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
