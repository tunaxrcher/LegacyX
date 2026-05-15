import type { NextRequest } from "next/server";
import { proxyAuthed } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  return proxyAuthed("/api/v1/patient/me/notifications", {
    method: "PATCH",
    body: await req.text(),
  });
}
