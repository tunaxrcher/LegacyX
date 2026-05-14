import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../../../shared/errors";
import {
  ListServicesQuery,
  listServices,
} from "../../../../../../../modules/public_catalog/public_catalog.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  try {
    const q = ListServicesQuery.parse({
      tenant_slug: req.nextUrl.searchParams.get("tenant_slug") ?? "legacyx",
      category_code: params.code,
    });
    const out = await listServices(q);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
