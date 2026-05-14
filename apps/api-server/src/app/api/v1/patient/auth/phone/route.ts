import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  PatientPhoneLoginDto,
  patientPhoneLogin,
} from "../../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = PatientPhoneLoginDto.parse(body);
    const out = await patientPhoneLogin(dto);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
