import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import { CancelOrderDto, cancelOrder } from "../../../../../../modules/order/order.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const dto = CancelOrderDto.parse(body);
    const result = await cancelOrder(ctx, params.id, dto.reason);
    return NextResponse.json({ data: result, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
