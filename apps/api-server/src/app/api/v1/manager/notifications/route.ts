import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";
import { parsePagination } from "../../../../../shared/pagination";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    // Anyone with `audit:read:tenant` can inspect the notification log — that's
    // ADMIN + MANAGER per the role matrix.
    await authorize(ctx, { resource: "audit", action: "read" });

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const channel = url.searchParams.get("channel") ?? undefined;
    const template = url.searchParams.get("template") ?? undefined;
    const { page, perPage, skip, take } = parsePagination(url, {
      defaultPerPage: 25,
      maxPerPage: 200,
    });

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (status) where.status = status;
    if (channel) where.channel = channel;
    if (template) where.templateCode = { contains: template };

    const [total, rows] = await Promise.all([
      prisma.notificationLog.count({ where }),
      prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        branchId: r.branchId,
        channel: r.channel,
        templateCode: r.templateCode,
        recipientRef: r.recipientRef,
        status: r.status,
        providerRef: r.providerRef,
        attempt: r.attempt,
        lastError: r.lastError,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        payload: r.payload,
      })),
      pagination: { total, page, perPage },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
