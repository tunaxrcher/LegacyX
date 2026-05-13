import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import { getEmrByVisit } from "../../../../../../modules/emr/emr.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { visitId: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await getEmrByVisit(ctx, params.visitId);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
