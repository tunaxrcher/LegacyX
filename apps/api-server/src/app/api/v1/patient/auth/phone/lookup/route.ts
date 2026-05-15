import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "../../../../../../../shared/errors";
import {
  PatientPhoneLookupDto,
  patientPhoneLookup,
} from "../../../../../../../modules/patient_portal/patient_portal.service";

export const dynamic = "force-dynamic";

/**
 * Existence probe for the patient login screen — given a phone number we
 * report whether ANY patient row in the tenant matches the hash. The patient
 * app uses this to short-circuit the OTP step when the phone isn't on file
 * (patients only become patients after they book at least once).
 *
 * The response intentionally exposes ONLY a boolean — no PII.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = PatientPhoneLookupDto.parse(body);
    const out = await patientPhoneLookup(dto);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
