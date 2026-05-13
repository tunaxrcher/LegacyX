import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import { CompleteProcedureDto, completeProcedure } from "../../../../../../modules/procedure/procedure.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const dto = CompleteProcedureDto.parse(body);
    const result = await completeProcedure(ctx, params.id, dto);
    return NextResponse.json({ data: result, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
