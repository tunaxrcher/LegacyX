import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse, NotFound } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";
import {
  UpdateAppointmentDto,
  CancelAppointmentDto,
  updateAppointment,
  cancelAppointment,
} from "../../../../../modules/appointment/appointment.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "appointment",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    const a = await prisma.appointment.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      include: {
        patient: {
          select: { id: true, hn: true, firstName: true, lastName: true },
        },
      },
    });
    if (!a) throw NotFound(`Appointment ${params.id} not found`);
    return NextResponse.json({ data: a, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = UpdateAppointmentDto.parse(body);
    const updated = await updateAppointment(ctx, params.id, dto);
    return NextResponse.json({ data: updated, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

/**
 * Cancel (soft state-flip — never deletes the row). Reason ≥ 3 chars
 * required, audit-logged.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    // Reason can be supplied via JSON body OR ?reason= query string.
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const reasonFromQuery = req.nextUrl.searchParams.get("reason");
    const dto = CancelAppointmentDto.parse(
      body ?? { reason: reasonFromQuery ?? "" },
    );
    const cancelled = await cancelAppointment(ctx, params.id, dto);
    return NextResponse.json({ data: cancelled, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
