import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  UpsertBomDto,
  getBomByProcedure,
  upsertBomForProcedure,
} from "../../../../../../modules/catalog/catalog-admin.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await getBomByProcedure(ctx, params.code);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = UpsertBomDto.parse({ ...body, procedure_code: params.code });
    const data = await upsertBomForProcedure(ctx, dto);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
