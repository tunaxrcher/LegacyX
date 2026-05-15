import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";
import { parsePagination } from "../../../../shared/pagination";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["NEW", "REPROCESSED", "ABANDONED"]);

/** List DLQ entries (newest first). */
export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, { resource: "audit", action: "read" });

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "NEW").toUpperCase();
    const q = (url.searchParams.get("q") ?? "").trim();
    const { page, perPage, skip, take } = parsePagination(url, {
      defaultPerPage: 25,
      maxPerPage: 100,
    });

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (ALLOWED_STATUSES.has(statusParam)) where.status = statusParam;
    if (q) {
      where.OR = [
        { eventName: { contains: q } },
        { error: { contains: q } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.deadLetter.count({ where }),
      prisma.deadLetter.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return NextResponse.json({
      data: rows,
      pagination: { total, page, perPage },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
