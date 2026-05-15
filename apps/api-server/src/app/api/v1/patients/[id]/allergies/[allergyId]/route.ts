import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../../shared/errors";
import { removeAllergy } from "../../../../../../../modules/allergy/allergy.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; allergyId: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await removeAllergy(ctx, params.id, params.allergyId);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
