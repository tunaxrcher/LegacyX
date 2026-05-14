import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  PhoneLookupDto,
  lookupPhone,
} from "../../../../../../modules/auth/auth.service";

export const dynamic = "force-dynamic";

/**
 * Step 1 of phone-based login. The client posts `{ tenant_slug, phone }` and
 * receives the list of (role.code, role.name) registered to that phone WITHIN
 * the tenant. The UI uses this list to decide whether to show a role-picker
 * before requesting an OTP.
 *
 * Always returns 200 — empty `roles` list when the phone isn't found, so we
 * don't leak which numbers exist.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = PhoneLookupDto.parse(body);
    const result = await lookupPhone(dto);
    return NextResponse.json({ data: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
