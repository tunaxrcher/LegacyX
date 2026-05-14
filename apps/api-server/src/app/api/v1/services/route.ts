import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";

export const dynamic = "force-dynamic";

/**
 * Read-only Service Catalog list for staff workflows (booking,
 * appointment-creation pickers).
 *
 * Distinct from `/api/v1/catalog/services` which is the MANAGER-side CRUD
 * (guarded by `catalog:manage`). RECEPTION/DOCTOR don't have that permission
 * but legitimately need to see the list when creating an appointment, so we
 * gate this endpoint on the lower bar of `appointment:read`.
 */
export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "appointment",
      action: "read",
      target: { branchId: ctx.branchId },
    });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const categoryId = url.searchParams.get("category_id") ?? undefined;
    const activeOnly = url.searchParams.get("active") !== "false";

    const rows = await prisma.service.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(activeOnly ? { active: true } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { nameTh: { contains: q } },
                { code: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: {
        category: { select: { id: true, code: true, name: true, nameTh: true } },
      },
      take: 200,
    });

    return NextResponse.json({
      data: rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        nameTh: s.nameTh,
        priceFrom: s.priceFrom != null ? Number(s.priceFrom) : null,
        priceTo: s.priceTo != null ? Number(s.priceTo) : null,
        durationMin: s.durationMin,
        procedureCode: s.procedureCode,
        category: s.category,
        active: s.active,
      })),
      correlation_id: correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
