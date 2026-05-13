import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";

export const dynamic = "force-dynamic";

/** List DLQ entries (NEW first). */
export async function GET() {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, { resource: "audit", action: "read" });

    const rows = await prisma.deadLetter.findMany({
      where: { tenantId: ctx.tenantId, status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ data: rows, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
