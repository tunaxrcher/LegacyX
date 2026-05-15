import { NextResponse, type NextRequest } from "next/server";
import { getPatientContext } from "../../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  UpdateNotificationPrefsDto,
  updateNotificationPrefs,
} from "../../../../../../modules/patient_line/patient_line.service";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = UpdateNotificationPrefsDto.parse(body);
    const data = await updateNotificationPrefs(ctx, dto);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
