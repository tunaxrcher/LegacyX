import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { parsePagination } from "../../../../shared/pagination";
import {
  CreateBreakGlassDto,
  createBreakGlass,
  listBreakGlass,
} from "../../../../modules/break_glass/break-glass.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const { page, perPage } = parsePagination(url, {
      defaultPerPage: 25,
      maxPerPage: 200,
    });
    const result = await listBreakGlass(ctx, {
      resourceType: url.searchParams.get("resource_type") ?? undefined,
      resourceId: url.searchParams.get("resource_id") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page,
      perPage,
    });
    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
      correlation_id: ctx.correlationId,
    });
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
    const dto = CreateBreakGlassDto.parse(body);
    const row = await createBreakGlass(ctx, dto);
    return NextResponse.json(
      { data: row, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
