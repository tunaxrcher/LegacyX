import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, { resource: "emr", action: "read" });

    const url = new URL(req.url);
    const refId = url.searchParams.get("ref_id") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const rows = await prisma.aIDraft.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(refId ? { refId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ data: rows, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
