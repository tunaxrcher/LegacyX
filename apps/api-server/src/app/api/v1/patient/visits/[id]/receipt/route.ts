import { NextResponse } from "next/server";
import { getPatientContext } from "../../../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../../../shared/errors";
import { getMyVisitReceipt } from "../../../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const data = await getMyVisitReceipt(ctx, params.id);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
