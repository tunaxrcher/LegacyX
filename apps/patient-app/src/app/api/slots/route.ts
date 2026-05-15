import { NextResponse, type NextRequest } from "next/server";
import { proxyPublic } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Slot lookup proxy (public — used by the booking page on client + server).
 * Forwards `branch_id`, `date`, and optional `service_id` to the upstream
 * `/api/v1/public/slots`. Tenant slug is auto-injected by `proxyPublic`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const date = url.searchParams.get("date");
  const serviceId = url.searchParams.get("service_id");
  if (!branchId || !date) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "missing branch_id/date" } },
      { status: 400 },
    );
  }
  const qs = new URLSearchParams({ branch_id: branchId, date });
  if (serviceId) qs.set("service_id", serviceId);
  return proxyPublic(`/api/v1/public/slots?${qs.toString()}`);
}
