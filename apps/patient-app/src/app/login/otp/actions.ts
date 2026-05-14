"use server";

import { cookies } from "next/headers";
import {
  PATIENT_SESSION_COOKIE,
  PATIENT_COOKIE_OPTIONS,
} from "@/lib/session";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/**
 * Forward (phone, otp_code) to the api-server phone-login endpoint. The OTP is
 * mocked server-side; the actual auth happens by matching phoneHash → Patient
 * row. On success we mint a JWT and stash it in the patient session cookie.
 */
export async function phoneLoginAction(input: {
  phone: string;
  otp_code: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/patient/auth/phone`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_slug: "legacyx",
      phone: input.phone,
      otp_code: input.otp_code,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      throw new Error(j.error?.message ?? `Login failed (${res.status})`);
    } catch {
      throw new Error(`Login failed: ${text || res.statusText}`);
    }
  }
  const json = (await res.json()) as {
    data: {
      token: string;
      expires_at: string;
      tenant: { id: string; slug: string; name: string };
      patient: { id: string; hn: string; first_name: string; last_name: string };
    };
  };
  const s = json.data;
  cookies().set(
    PATIENT_SESSION_COOKIE,
    JSON.stringify({
      token: s.token,
      expiresAt: s.expires_at,
      tenant: s.tenant,
      patient: s.patient,
    }),
    PATIENT_COOKIE_OPTIONS,
  );
}
