import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import { startVisit } from "../../../../../../modules/visit/visit.service";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const result = await startVisit(ctx, params.id);
    return NextResponse.json({ data: result, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
