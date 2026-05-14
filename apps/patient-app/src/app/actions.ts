"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PATIENT_SESSION_COOKIE,
  PATIENT_COOKIE_OPTIONS,
} from "@/lib/session";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function patientLoginAction(formData: FormData): Promise<void> {
  const tenant_slug = String(formData.get("tenant_slug") ?? "legacyx").trim();
  const line_user_id = String(formData.get("line_user_id") ?? "").trim();

  if (!line_user_id) {
    throw new Error("กรุณาระบุ LINE User ID");
  }

  const res = await fetch(`${API_BASE}/api/v1/patient/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_slug, line_user_id }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`เข้าสู่ระบบไม่สำเร็จ: ${text || res.statusText}`);
  }
  const json = (await res.json()) as { data: unknown };
  const session = json.data;

  cookies().set(
    PATIENT_SESSION_COOKIE,
    JSON.stringify(session),
    PATIENT_COOKIE_OPTIONS,
  );
  redirect("/");
}

export async function patientLogoutAction(): Promise<void> {
  cookies().delete(PATIENT_SESSION_COOKIE);
  redirect("/login");
}
