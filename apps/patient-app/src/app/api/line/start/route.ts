import { proxyAuthed } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  return proxyAuthed("/api/v1/patient/me/line/link/start", { method: "POST" });
}
