import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  AssignRoomDto,
  assignRoom,
} from "../../../../../../modules/visit/visit.service";

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
    const dto = AssignRoomDto.parse(body);
    const data = await assignRoom(ctx, params.id, dto);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
