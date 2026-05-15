import type { NextRequest } from "next/server";
import { proxyAuthed } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return proxyAuthed("/api/v1/patient/appointments", {
    method: "POST",
    body: await req.text(),
  });
}
