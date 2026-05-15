import { NextResponse } from "next/server";
import { getPatientSession } from "@/lib/session";
import { patientFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = getPatientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const upstream = await patientFetch(
    session,
    `/api/v1/patient/me/line/link/start`,
    { method: "POST" },
  );
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
