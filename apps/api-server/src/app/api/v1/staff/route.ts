import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";

export const dynamic = "force-dynamic";

/**
 * Staff directory — used by Reception when picking a doctor for an
 * appointment, by Manager dashboards, etc. Read-only and tenant-scoped.
 *
 * Query params:
 *   role  — primary role code filter (e.g. DOCTOR, NURSE).
 *   q     — search term against fullName.
 *   limit — page size (default 50, max 100).
 *
 * Authorization: any user with `appointment:read:branch` may consume this
 * (sufficient for the booking workflow). It returns ONLY id + fullName +
 * primaryRoleCode + active flag — no PII.
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
    const role = url.searchParams.get("role")?.toUpperCase();
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    );

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      status: "ACTIVE",
    };
    if (role) where.primaryRoleCode = role;
    if (q) where.fullName = { contains: q };

    const rows = await prisma.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      take: limit,
      select: {
        id: true,
        fullName: true,
        primaryRoleCode: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({
      data: rows,
      correlation_id: correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
