import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";

export const dynamic = "force-dynamic";

/**
 * Readiness probe — checks downstream dependencies (DB connectivity). Kubernetes
 * uses this to decide whether to route traffic to the pod.
 *
 * Returns 200 only if MySQL is reachable. We do NOT check Redis here because
 * the api-server keeps working (writes to the outbox table) even when the
 * worker / Redis is down; readiness should reflect "can serve traffic", not
 * "every dependency is healthy".
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};
  let allOk = true;

  // MySQL
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.mysql = { ok: true, latency_ms: Date.now() - t0 };
  } catch (err) {
    allOk = false;
    checks.mysql = {
      ok: false,
      latency_ms: Date.now() - t0,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    };
  }

  return NextResponse.json(
    {
      status: allOk ? "ready" : "degraded",
      service: "api-server",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
