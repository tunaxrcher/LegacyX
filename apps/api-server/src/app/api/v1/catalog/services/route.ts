import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  ServiceDto,
  createService,
  listServicesAdmin,
} from "../../../../../modules/service_catalog/service_catalog_admin.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const sp = req.nextUrl.searchParams;
    const data = await listServicesAdmin(ctx, {
      q: sp.get("q") ?? undefined,
      category_id: sp.get("category_id") ?? undefined,
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
    const dto = ServiceDto.parse(body);
    const data = await createService(ctx, dto);
    return NextResponse.json(
      { data, correlation_id: ctx.correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
