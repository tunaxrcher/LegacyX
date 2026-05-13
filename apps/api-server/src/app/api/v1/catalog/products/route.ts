import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  CreateProductDto,
  createProduct,
  listProducts,
} from "../../../../../modules/catalog/catalog-admin.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const data = await listProducts(ctx, {
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    });
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = CreateProductDto.parse(body);
    const data = await createProduct(ctx, dto);
    return NextResponse.json(
      { data, correlation_id: ctx.correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
