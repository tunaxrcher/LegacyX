import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import {
  listPromotions,
  createPromotion,
  CreatePromotionDto,
} from "../../../../modules/promotion/promotion.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "1";
    const data = await listPromotions(ctx, includeInactive);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const input = CreatePromotionDto.parse(body);
    const data = await createPromotion(ctx, input);
    return NextResponse.json(
      { data, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
