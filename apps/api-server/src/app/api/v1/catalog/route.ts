import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { searchCatalog } from "../../../../modules/catalog/catalog.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const data = await searchCatalog(ctx, {
      type: url.searchParams.get("type") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
    });
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
