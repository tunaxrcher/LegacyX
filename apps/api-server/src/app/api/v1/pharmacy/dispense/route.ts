import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  DispenseOrderDto,
  dispenseOrder,
} from "../../../../../modules/pharmacy/pharmacy.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = DispenseOrderDto.parse(body);
    const result = await dispenseOrder(ctx, dto);
    return NextResponse.json(
      { data: result, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
