import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  applyPromoCode,
  ApplyPromoCodeDto,
} from "../../../../../../modules/promotion/promotion.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const input = ApplyPromoCodeDto.parse({ ...body, invoice_id: params.id });
    const data = await applyPromoCode(ctx, input);
    return NextResponse.json(
      { data, correlation_id: correlationId },
      { status: 200 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
