import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../shared/errors";
import { LoginDto, login } from "../../../../../modules/auth/auth.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = LoginDto.parse(body);
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const result = await login(dto, { ip, userAgent });
    return NextResponse.json({ data: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
