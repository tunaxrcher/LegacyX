import { NextResponse } from "next/server";
import { getPatientContext } from "../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../shared/errors";
import { listMyWallets } from "../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function GET() {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const data = await listMyWallets(ctx);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
