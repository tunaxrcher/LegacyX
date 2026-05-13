import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { ReceiveStockDto, receiveStock } from "../../../../../modules/inventory/inventory.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = ReceiveStockDto.parse(body);
    const result = await receiveStock(ctx, dto);
    return NextResponse.json(
      { data: result, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
