import { NextResponse, type NextRequest } from "next/server";
import { getPatientSession } from "@/lib/session";
import { patientFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getPatientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const date = url.searchParams.get("date");
  if (!branchId || !date) {
    return NextResponse.json({ error: "missing branch_id/date" }, { status: 400 });
  }
  const upstream = await patientFetch(
    session,
    `/api/v1/patient/slots?branch_id=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`,
  );
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
