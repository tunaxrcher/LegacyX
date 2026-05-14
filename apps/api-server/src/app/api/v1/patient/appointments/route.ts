import { NextResponse, type NextRequest } from "next/server";
import { getPatientContext } from "../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  CreatePatientAppointmentDto,
  createPatientAppointment,
  listMyAppointments,
} from "../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const sp = req.nextUrl.searchParams;
    const data = await listMyAppointments(ctx, {
      upcomingOnly: sp.get("upcoming") === "1",
      page: Number(sp.get("page") ?? 1),
      perPage: Number(sp.get("perPage") ?? 20),
    });
    return NextResponse.json({ ...data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = CreatePatientAppointmentDto.parse(body);
    const data = await createPatientAppointment(ctx, dto);
    return NextResponse.json(
      { data, correlation_id: ctx.correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
