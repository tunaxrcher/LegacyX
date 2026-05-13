import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __legacyxPrisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient.
 * In dev, hot-reload would otherwise create new connections each rebuild.
 */
export const prisma: PrismaClient =
  globalThis.__legacyxPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__legacyxPrisma = prisma;
}

export type { PrismaClient } from "@prisma/client";
