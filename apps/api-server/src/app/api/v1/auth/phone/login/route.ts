import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  PhoneLoginDto,
  loginByPhone,
} from "../../../../../../modules/auth/auth.service";

export const dynamic = "force-dynamic";

/**
 * Step 2 of phone-based login. Posts `{ tenant_slug, phone, otp, role_code? }`
 * and on success returns the standard session payload (same shape as the
 * legacy email/password login).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = PhoneLoginDto.parse(body);
    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const result = await loginByPhone(dto, { ip, userAgent });
    return NextResponse.json({ data: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
