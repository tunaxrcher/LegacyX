import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe — should NEVER hit the database. Returns 200 as long as the
 * Node process is up. Kubernetes uses this to decide whether to kill the pod.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "api-server",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round(process.uptime()),
  });
}
