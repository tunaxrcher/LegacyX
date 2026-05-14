import { NextResponse, type NextRequest } from "next/server";
import { getPatientContext } from "../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  ListSlotsQuery,
  listSlots,
} from "../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const dto = ListSlotsQuery.parse({
      branch_id: url.searchParams.get("branch_id") ?? "",
      date: url.searchParams.get("date") ?? "",
    });
    const data = await listSlots(ctx, dto);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
