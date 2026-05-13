import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";
import { CreateOrderDto, createOrder } from "../../../../modules/order/order.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "order",
      action: "write",
      target: { branchId: ctx.branchId },
    });
    const url = new URL(req.url);
    const visitId = url.searchParams.get("visit_id");
    const patientId = url.searchParams.get("patient_id");
    const status = url.searchParams.get("status");
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
    };
    if (visitId) where.visitId = visitId;
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;

    const rows = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: true,
        procedures: true,
      },
    });
    return NextResponse.json({ data: rows, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = CreateOrderDto.parse(body);
    const result = await createOrder(ctx, dto);
    return NextResponse.json(
      { data: result, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
