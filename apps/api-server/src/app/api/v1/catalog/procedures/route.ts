import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { listProceduresForAdmin } from "../../../../../modules/service_catalog/service_catalog_admin.service";

export const dynamic = "force-dynamic";

export async function GET() {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await listProceduresForAdmin(ctx);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
