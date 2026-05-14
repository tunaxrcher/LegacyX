import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  TenantQuery,
  listCategories,
} from "../../../../../modules/public_catalog/public_catalog.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = TenantQuery.parse({
      tenant_slug: req.nextUrl.searchParams.get("tenant_slug") ?? "legacyx",
    });
    const out = await listCategories(q);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
