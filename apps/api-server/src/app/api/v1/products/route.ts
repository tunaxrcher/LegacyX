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
      resource: "inventory",
      action: "read",
      target: { branchId: ctx.branchId },
    });

    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      active: true,
      deletedAt: null,
    };
    if (category) where.category = category;
    if (q) {
      where.OR = [{ name: { contains: q } }, { sku: { contains: q } }];
    }

    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        unit: true,
        trackStock: true,
        attributes: true,
      },
    });
    return NextResponse.json({ data: rows, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
