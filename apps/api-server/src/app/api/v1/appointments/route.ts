import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";
import {
  CreateAppointmentDto,
  createAppointment,
} from "../../../../modules/appointment/appointment.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = CreateAppointmentDto.parse(body);
    const appt = await createAppointment(ctx, dto);
    return NextResponse.json(
      { data: appt, correlation_id: ctx.correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

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
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("perPage") ?? 20)),
    );
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const status = url.searchParams.get("status");

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
    };
    if (from || to) {
      where.scheduledAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (status) where.status = status;

    const [total, rows] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          patient: { select: { id: true, hn: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return NextResponse.json({
      data: rows,
      pagination: { page, perPage, total },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
