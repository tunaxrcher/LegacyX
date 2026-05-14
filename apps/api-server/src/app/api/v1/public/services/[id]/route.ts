import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  GetServiceQuery,
  getService,
} from "../../../../../../modules/public_catalog/public_catalog.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const q = GetServiceQuery.parse({
      tenant_slug: req.nextUrl.searchParams.get("tenant_slug") ?? "legacyx",
      service_id: params.id,
    });
    const out = await getService(q);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
