import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  ListPublicSlotsQuery,
  listPublicSlots,
} from "../../../../../modules/public_catalog/public_catalog.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = ListPublicSlotsQuery.parse({
      tenant_slug: sp.get("tenant_slug") ?? "legacyx",
      branch_id: sp.get("branch_id") ?? "",
      date: sp.get("date") ?? "",
      service_id: sp.get("service_id") ?? undefined,
    });
    const out = await listPublicSlots(q);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
