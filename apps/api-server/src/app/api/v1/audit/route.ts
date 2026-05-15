import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";
import { parsePagination } from "../../../../shared/pagination";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "audit",
      action: "read",
      target: {},
    });

    const url = new URL(req.url);
    const resourceType = url.searchParams.get("resource_type");
    const resourceId = url.searchParams.get("resource_id");
    const actorUserId = url.searchParams.get("actor_user_id");
    const action = url.searchParams.get("action");
    const correlationFilter = url.searchParams.get("correlation_id");
    const q = (url.searchParams.get("q") ?? "").trim();
    const { page, perPage, skip, take } = parsePagination(url, {
      defaultPerPage: 50,
      maxPerPage: 200,
    });

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;
    if (actorUserId) where.actorUserId = actorUserId;
    if (action) where.action = { startsWith: action };
    if (correlationFilter) where.correlationId = correlationFilter;
    if (q) {
      where.OR = [
        { resourceId: { contains: q } },
        { reason: { contains: q } },
        { correlationId: { contains: q } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take,
      }),
    ]);

    // Resolve actor names
    const userIds = Array.from(
      new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x)),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, phone: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        id: r.id.toString(), // BigInt -> string for JSON
        actor: r.actorUserId ? userMap.get(r.actorUserId) ?? null : null,
      })),
      pagination: { total, page, perPage },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
