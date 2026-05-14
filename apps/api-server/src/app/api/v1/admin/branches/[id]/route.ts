import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  UpdateBranchDto,
  updateBranch,
} from "../../../../../../modules/admin/admin-branches.service";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = UpdateBranchDto.parse(body);
    const result = await updateBranch(ctx, params.id, dto);
    return NextResponse.json({ data: result, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
