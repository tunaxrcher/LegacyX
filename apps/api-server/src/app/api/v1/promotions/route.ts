import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { parsePagination } from "../../../../shared/pagination";
import {
  listPromotions,
  createPromotion,
  CreatePromotionDto,
  type ListPromotionsFilters,
} from "../../../../modules/promotion/promotion.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "1";
    const statusParam = (url.searchParams.get("status") ?? "").toLowerCase();
    const status: ListPromotionsFilters["status"] =
      statusParam === "active" || statusParam === "inactive" || statusParam === "expired" || statusParam === "all"
        ? statusParam
        : undefined;
    const { page, perPage } = parsePagination(url, {
      defaultPerPage: 25,
      maxPerPage: 200,
    });
    const result = await listPromotions(ctx, {
      q: url.searchParams.get("q") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      status,
      includeInactive,
      page,
      perPage,
    });
    // `listPromotions` only returns the paginated shape when filters force it;
    // since we pass `page`/`perPage` here we're always in the paginated branch.
    if (Array.isArray(result)) {
      return NextResponse.json({
        data: result,
        pagination: { total: result.length, page: 1, perPage: result.length },
        correlation_id: correlationId,
      });
    }
    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
      correlation_id: correlationId,
    });
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
