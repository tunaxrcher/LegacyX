"use server";

import { cookies } from "next/headers";
import {
  PATIENT_SESSION_COOKIE,
  PATIENT_COOKIE_OPTIONS,
  getPatientSession,
} from "@/lib/session";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

type Mode = "SCHEDULED" | "WALKIN";

type GuestBookArgs = {
  service_id: string;
  branch_id: string;
  mode: Mode;
  scheduled_at: string | null;
  full_name: string;
  phone: string;
  kyc_image_data_url: string | null;
};

type AuthedBookArgs = {
  service_id: string;
  branch_id: string;
  mode: Mode;
  scheduled_at: string | null;
};

export type BookResult = { appointmentId: string };

/**
 * Guest booking path — single atomic call to `/api/v1/public/book` which
 * upserts the Patient, creates the Appointment, and returns a freshly minted
 * patient JWT. We set the cookie here so the very next navigation lands the
 * user inside the authed area.
 */
export async function bookGuestAction(args: GuestBookArgs): Promise<BookResult> {
  const res = await fetch(`${API_BASE}/api/v1/public/book`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_slug: "legacyx",
      service_id: args.service_id,
      branch_id: args.branch_id,
      mode: args.mode,
      scheduled_at: args.scheduled_at ?? undefined,
      full_name: args.full_name,
      phone: args.phone,
      kyc_image_data_url: args.kyc_image_data_url ?? undefined,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Booking failed: ${text || res.statusText}`);
  }
  const json = (await res.json()) as {
    data: {
      appointment: { id: string };
      session: {
        token: string;
        expires_at: string;
        tenant: { id: string; slug: string; name: string };
        patient: { id: string; hn: string; first_name: string; last_name: string };
      };
    };
  };
  const s = json.data.session;
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
  return { appointmentId: json.data.appointment.id };
}

/**
 * Authed booking path — used when the visitor already had a session before
 * arriving at the booking page. Reuses the existing patient endpoint to
 * preserve all the audit/JWT semantics from Phase 7.
 */
export async function bookAuthedAction(args: AuthedBookArgs): Promise<BookResult> {
  const session = getPatientSession();
  if (!session) throw new Error("No session");

  let scheduledAt: string;
  if (args.mode === "WALKIN") {
    scheduledAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  } else {
    if (!args.scheduled_at) throw new Error("scheduled_at required");
    scheduledAt = args.scheduled_at;
  }

  const res = await fetch(`${API_BASE}/api/v1/patient/appointments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      branch_id: args.branch_id,
      scheduled_at: scheduledAt,
      duration_min: 30,
      reason: `Booking via patient app — service_id=${args.service_id}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Booking failed: ${text || res.statusText}`);
  }
  // patient_portal returns the appointment row directly under `data` (not nested).
  const json = (await res.json()) as { data: { id: string } };
  return { appointmentId: json.data.id };
}
