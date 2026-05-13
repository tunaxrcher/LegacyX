import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { listRolesWithPermissions } from "../../../../../modules/admin/admin-users.service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await listRolesWithPermissions(ctx);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
