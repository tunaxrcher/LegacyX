import { NextResponse } from "next/server";
import { getPatientContext } from "../../../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../../../shared/errors";
import { linkUnlink } from "../../../../../../../modules/patient_line/patient_line.service";

export const dynamic = "force-dynamic";

export async function POST() {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const data = await linkUnlink(ctx);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
