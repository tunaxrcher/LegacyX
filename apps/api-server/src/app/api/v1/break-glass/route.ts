import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
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
    const data = await listBreakGlass(ctx, {
      resourceType: url.searchParams.get("resource_type") ?? undefined,
      resourceId: url.searchParams.get("resource_id") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
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
