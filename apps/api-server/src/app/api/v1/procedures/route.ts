import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "procedure",
      action: "perform",
      target: { branchId: ctx.branchId },
    });
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const orderId = url.searchParams.get("order_id");
    const patientId = url.searchParams.get("patient_id");
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
    };
    if (status) where.status = status;
    if (orderId) where.orderId = orderId;
    if (patientId) where.patientId = patientId;

    const rows = await prisma.procedure.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { order: { select: { id: true, visitId: true } } },
    });
    return NextResponse.json({ data: rows, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
