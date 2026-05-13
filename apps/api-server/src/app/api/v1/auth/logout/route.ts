import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../shared/errors";
import { logout } from "../../../../../modules/auth/auth.service";

export const dynamic = "force-dynamic";

function extractToken(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-session-token") ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const token = extractToken(req);
    await logout(token);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
