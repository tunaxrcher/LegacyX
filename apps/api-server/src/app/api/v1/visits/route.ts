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
      resource: "appointment",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const patientId = url.searchParams.get("patient_id");
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
    };
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;

    const rows = await prisma.visit.findMany({
      where,
      orderBy: { checkedInAt: "desc" },
      take: limit,
      include: {
        patient: { select: { id: true, hn: true, firstName: true, lastName: true } },
        appointment: { select: { id: true, scheduledAt: true, channel: true } },
      },
    });

    // Resolve currently-held room reservations for these visits' appointments
    // so the UI can show "Room 301" badges + decide whether StartVisitButton
    // needs to ask for a room first.
    const apptIds = rows
      .map((v) => v.appointmentId)
      .filter((x): x is string => !!x);
    const reservations = apptIds.length
      ? await prisma.resourceReservation.findMany({
          where: {
            tenantId: ctx.tenantId,
            appointmentId: { in: apptIds },
            status: { in: ["HELD", "CONFIRMED"] },
          },
          include: {
            resource: { select: { id: true, code: true, name: true, type: true } },
          },
        })
      : [];
    const roomByAppt = new Map<
      string,
      { id: string; code: string; name: string; type: string }
    >();
    for (const r of reservations) {
      if (r.appointmentId && r.resource.type === "ROOM") {
        roomByAppt.set(r.appointmentId, {
          id: r.resource.id,
          code: r.resource.code,
          name: r.resource.name,
          type: r.resource.type,
        });
      }
    }

    return NextResponse.json({
      data: rows.map((v) => ({
        ...v,
        currentRoom: v.appointmentId ? roomByAppt.get(v.appointmentId) ?? null : null,
      })),
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
