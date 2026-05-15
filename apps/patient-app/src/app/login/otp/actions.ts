"use server";

import { TENANT_SLUG, publicFetch, setPatientSessionCookie } from "@/lib/api";

export type PhoneLookupResult =
  | { ok: true; exists: boolean }
  | { ok: false; error: string };

/**
 * Pre-flight existence check before opening the OTP dialog. Patients only
 * become patients after they book at least once, so it's a much better UX to
 * tell them up-front "ไม่พบเบอร์โทรนี้ในระบบ — กรุณาจองบริการก่อน" than to let
 * them type a 6-digit OTP and then fail.
 */
export async function phoneLookupAction(input: {
  phone: string;
}): Promise<PhoneLookupResult> {
  try {
    const res = await publicFetch("/api/v1/patient/auth/phone/lookup", {
      method: "POST",
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        phone: input.phone,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { ok: false, error: body.error?.message ?? "Lookup failed" };
    }
    const body = (await res.json()) as { data: { exists: boolean } };
    return { ok: true, exists: !!body.data?.exists };
  } catch (err) {
    return {
      ok: false,
      error: `Cannot reach API server: ${(err as Error).message}`,
    };
  }
}

/**
 * Forward (phone, otp_code) to the api-server phone-login endpoint. The OTP is
 * mocked server-side; the actual auth happens by matching phoneHash → Patient
 * row. On success we mint a JWT and stash it in the patient session cookie.
 */
export async function phoneLoginAction(input: {
  phone: string;
  otp_code: string;
}): Promise<void> {
  const res = await publicFetch("/api/v1/patient/auth/phone", {
    method: "POST",
    body: JSON.stringify({
      tenant_slug: TENANT_SLUG,
      phone: input.phone,
      otp_code: input.otp_code,
    }),
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
  setPatientSessionCookie(json.data);
}
