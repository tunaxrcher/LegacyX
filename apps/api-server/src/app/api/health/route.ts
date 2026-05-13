import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  // DB ping
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    checks.db = { ok: false, error: (e as Error).message };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
