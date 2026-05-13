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
      resource: "patient",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };
    if (q) {
      where.OR = [
        { hn: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
      ];
    }

    const rows = await prisma.patient.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: limit,
      select: {
        id: true,
        hn: true,
        firstName: true,
        lastName: true,
        gender: true,
        dob: true,
        status: true,
      },
    });

    return NextResponse.json({
      data: rows,
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
