import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../../shared/errors";
import {
  ResetPasswordDto,
  resetUserPassword,
} from "../../../../../../../modules/admin/admin-users.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = ResetPasswordDto.parse(body);
    const result = await resetUserPassword(ctx, params.id, dto);
    return NextResponse.json({ data: result, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
