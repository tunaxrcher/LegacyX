"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PATIENT_SESSION_COOKIE } from "@/lib/session";

/**
 * Phone+OTP login moved to `/login/otp/actions.ts` (Phase G).
 * This file now hosts only the universal logout action.
 */
export async function patientLogoutAction(): Promise<void> {
  cookies().delete(PATIENT_SESSION_COOKIE);
  redirect("/");
}
