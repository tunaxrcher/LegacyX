import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../shared/errors";
import { getMe } from "../../../../../modules/auth/auth.service";

export const dynamic = "force-dynamic";

function extractToken(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-session-token") ?? "";
}

export async function GET(req: NextRequest) {
  try {
    const token = extractToken(req);
    const data = await getMe(token);
    return NextResponse.json({ data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
