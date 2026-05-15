import { NextResponse, type NextRequest } from "next/server";
import { getPatientContext } from "../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  UpdatePatientProfileDto,
  getMyProfile,
  updateMyProfile,
} from "../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function GET() {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const data = await getMyProfile(ctx);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function PATCH(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = UpdatePatientProfileDto.parse(body);
    const data = await updateMyProfile(ctx, dto);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
