import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  PatientLoginDto,
  patientLogin,
} from "../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = PatientLoginDto.parse(body);
    const out = await patientLogin(dto);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
