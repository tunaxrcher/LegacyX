import type { NextRequest } from "next/server";
import { proxyAuthed } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Patient self-service profile updates.
 * Thin authenticated proxy to `PATCH /api/v1/patient/me`.
 */
export async function PATCH(req: NextRequest) {
  return proxyAuthed("/api/v1/patient/me", {
    method: "PATCH",
    body: await req.text(),
  });
}
