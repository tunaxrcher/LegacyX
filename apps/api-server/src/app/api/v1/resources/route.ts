import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import {
  CreateResourceDto,
  createResource,
  listResourcesWithStatus,
} from "../../../../modules/resource/resource.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const data = await listResourcesWithStatus(ctx, {
      type: url.searchParams.get("type") ?? undefined,
      includeRetired: url.searchParams.get("include_retired") === "true",
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
    const dto = CreateResourceDto.parse(body);
    const r = await createResource(ctx, dto);
    return NextResponse.json(
      { data: r, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
