import { NextResponse, type NextRequest } from "next/server";
import { getPatientContext } from "../../../../../../../../shared/patientContext";
import { toErrorResponse } from "../../../../../../../../shared/errors";
import {
  LinkCallbackDto,
  linkCallback,
} from "../../../../../../../../modules/patient_line/patient_line.service";

export const dynamic = "force-dynamic";

/**
 * OAuth callback consumed by the patient-app server. Although the LINE
 * authorization server initiated the redirect on the user's browser, the
 * patient-app's authenticated client (with the JWT cookie) is what actually
 * hits this URL via a server-side fetch (see patient-app:line/callback page).
 *
 * That means we still have a Bearer token in headers — `getPatientContext()`
 * enforces auth as usual.
 */
export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getPatientContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = LinkCallbackDto.parse(body);
    const data = await linkCallback(ctx, dto);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
