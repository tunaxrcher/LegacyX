import { cookies } from "next/headers";

export type PatientSession = {
  token: string;
  expiresAt: string;
  tenant: { id: string; slug: string; name: string };
  patient: {
    id: string;
    hn: string;
    first_name: string;
    last_name: string;
  };
};

const COOKIE_KEY = "lx_patient_session";

export const PATIENT_SESSION_COOKIE = COOKIE_KEY;

export const PATIENT_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  /** Match JWT TTL (14 days). */
  maxAge: 60 * 60 * 24 * 14,
};

export function getPatientSession(): PatientSession | null {
  const c = cookies().get(COOKIE_KEY);
  if (!c) return null;
  try {
    try {
      return JSON.parse(c.value);
    } catch {
      return JSON.parse(decodeURIComponent(c.value));
    }
  } catch {
    return null;
  }
}
