import { NextResponse, type NextRequest } from "next/server";
import { getPatientSession } from "@/lib/session";
import { patientFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = getPatientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const upstream = await patientFetch(session, `/api/v1/patient/appointments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
