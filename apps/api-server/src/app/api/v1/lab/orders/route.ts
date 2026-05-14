import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  createLabOrder,
  CreateLabOrderDto,
  listLabOrders,
} from "../../../../../modules/lab/lab.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const sp = req.nextUrl.searchParams;
    const data = await listLabOrders(ctx, {
      visit_id: sp.get("visit_id") ?? undefined,
      patient_id: sp.get("patient_id") ?? undefined,
      status: sp.get("status") ?? undefined,
    });
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
    const input = CreateLabOrderDto.parse(body);
    const data = await createLabOrder(ctx, input);
    return NextResponse.json(
      { data, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
