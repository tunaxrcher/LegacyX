import { Prisma, prisma } from "@legacyx/db";

/**
 * Atomically claim (event_id, handler_name) for processing.
 *
 * Returns:
 *   "RUN"        — first time; caller MUST execute side-effects then call markSuccess/markFailed
 *   "SKIP_DONE"  — previously succeeded; caller should return immediately (idempotent no-op)
 *   "RETRY"      — previously failed; safe to retry (claim refreshed)
 */
export async function claimProcessing(
  eventId: string,
  handlerName: string,
): Promise<"RUN" | "SKIP_DONE" | "RETRY"> {
  const existing = await prisma.processedEvent.findUnique({
    where: { eventId_handlerName: { eventId, handlerName } },
  });
  if (!existing) {
    try {
      await prisma.processedEvent.create({
        data: { eventId, handlerName, status: "FAILED", error: "in-flight" },
      });
      return "RUN";
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // Race: another worker just claimed it
        return "SKIP_DONE";
      }
      throw e;
    }
  }
  if (existing.status === "SUCCESS") return "SKIP_DONE";
  return "RETRY";
}

export async function markSuccess(
  eventId: string,
  handlerName: string,
  resultHash?: string,
): Promise<void> {
  await prisma.processedEvent.update({
    where: { eventId_handlerName: { eventId, handlerName } },
    data: { status: "SUCCESS", resultHash, error: null, processedAt: new Date() },
  });
}

export async function markFailed(
  eventId: string,
  handlerName: string,
  err: unknown,
): Promise<void> {
  await prisma.processedEvent.update({
    where: { eventId_handlerName: { eventId, handlerName } },
    data: {
      status: "FAILED",
      error: (err as Error).message?.slice(0, 1000) ?? String(err),
      processedAt: new Date(),
    },
  });
}
