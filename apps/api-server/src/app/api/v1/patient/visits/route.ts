import { NextResponse, type NextRequest } from "next/server";
import { getPatientContext } from "../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../shared/errors";
import { listMyVisits } from "../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const data = await listMyVisits(ctx, {
      page: Number(url.searchParams.get("page") ?? 1),
      perPage: Number(url.searchParams.get("perPage") ?? 10),
    });
    return NextResponse.json({ ...data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
