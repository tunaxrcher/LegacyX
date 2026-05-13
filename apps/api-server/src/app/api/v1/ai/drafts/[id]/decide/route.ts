import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../../shared/errors";
import {
  ApprovalDto,
  decideOnDraft,
} from "../../../../../../../modules/ai/ai.service";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = ApprovalDto.parse(body);
    const data = await decideOnDraft(ctx, params.id, dto);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
