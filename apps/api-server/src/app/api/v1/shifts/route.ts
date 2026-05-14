import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import {
  OpenShiftDto,
  listShifts,
  openShift,
} from "../../../../modules/shift/shift.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const data = await listShifts(ctx, limit);
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
    const dto = OpenShiftDto.parse(body);
    const shift = await openShift(ctx, dto);
    return NextResponse.json(
      { data: shift, correlation_id: ctx.correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
