/**
 * Patient-app HTTP layer — single source of truth.
 *
 * Everything that talks to the api-server (server components, server actions,
 * /api/* proxy routes) MUST go through this file. Spreading raw `fetch()`
 * calls + ad-hoc `process.env.API_BASE_URL` constants across the codebase has
 * already caused real bugs (hardcoded tenant_slug, mismatched env-var
 * fallbacks, BookFlow using a never-defined `NEXT_PUBLIC_API_BASE_URL`).
 *
 * Helpers:
 *   - `patientFetch` / `patientJson`   — authed Bearer-token requests
 *   - `publicFetch`  / `publicJson`    — public (no-auth) endpoints; auto
 *                                        injects `tenant_slug` query param
 *   - `proxyAuthed`  / `proxyPublic`   — used by /api/* proxy routes; takes
 *                                        a path + init and returns a
 *                                        `NextResponse` ready to be returned
 *                                        from the route handler
 *   - `setPatientSessionCookie`        — single canonical way to set the
 *                                        patient session cookie after login
 *                                        / guest booking
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PATIENT_SESSION_COOKIE,
  PATIENT_COOKIE_OPTIONS,
  getPatientSession,
  type PatientSession,
} from "./session";

// ────────────────────────────────────────────────────────────────────────────
// Constants — env-var resolution lives ONLY here so the rest of the codebase
// can never drift out of sync.
// ────────────────────────────────────────────────────────────────────────────

export const API_BASE =
  process.env.API_BASE_URL ?? "http://localhost:3001";

/**
 * Which tenant the patient-app belongs to.
 * Single-tenant deployments set `PATIENT_APP_TENANT_SLUG`. The
 * `NEXT_PUBLIC_*` fallback exists for client components that need it (none
 * should — they should hit `/api/*` proxies — but kept for safety).
 */
export const TENANT_SLUG =
  process.env.PATIENT_APP_TENANT_SLUG ??
  process.env.NEXT_PUBLIC_TENANT_SLUG ??
  "legacyx";

// ────────────────────────────────────────────────────────────────────────────
// Internal building blocks
// ────────────────────────────────────────────────────────────────────────────

function mergeHeaders(
  base: Record<string, string>,
  extra: HeadersInit | undefined,
): Record<string, string> {
  if (!extra) return base;
  if (extra instanceof Headers) {
    const merged = { ...base };
    extra.forEach((v, k) => {
      merged[k] = v;
    });
    return merged;
  }
  if (Array.isArray(extra)) {
    const merged = { ...base };
    for (const [k, v] of extra) merged[k] = v;
    return merged;
  }
  return { ...base, ...(extra as Record<string, string>) };
}

/** Append `tenant_slug=…` if the URL doesn't already carry one. */
function withTenantSlug(path: string): string {
  if (path.includes("tenant_slug=")) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}tenant_slug=${encodeURIComponent(TENANT_SLUG)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Authed requests
// ────────────────────────────────────────────────────────────────────────────

/**
 * Low-level authed fetch. Attaches the Bearer token from the patient session
 * cookie. `cache: "no-store"` is enforced — the patient app deals in
 * personal data, never CDN-cacheable.
 */
export async function patientFetch(
  session: PatientSession | null,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = mergeHeaders(
    { "content-type": "application/json" },
    init?.headers,
  );
  if (session?.token) headers["authorization"] = `Bearer ${session.token}`;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
}

/** Authed JSON helper — throws on non-2xx so callers can `try { … } catch`. */
export async function patientJson<T>(
  session: PatientSession | null,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await patientFetch(session, path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ────────────────────────────────────────────────────────────────────────────
// Public requests (auto tenant_slug)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Public endpoint fetch. Auto-injects `tenant_slug` so callers stop
 * hardcoding `?tenant_slug=legacyx` everywhere (which is an explicit
 * AGENTS.md violation).
 */
export async function publicFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = mergeHeaders(
    { "content-type": "application/json" },
    init?.headers,
  );
  return fetch(`${API_BASE}${withTenantSlug(path)}`, {
    ...init,
    cache: "no-store",
    headers,
  });
}

/** Public JSON helper — throws on non-2xx. */
export async function publicJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await publicFetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ────────────────────────────────────────────────────────────────────────────
// /api/* proxy helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the standard "passthrough" NextResponse from an upstream Response.
 * Body is forwarded as-is; status + content-type come from the upstream.
 */
async function passthrough(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

/**
 * Proxy a request from a patient-app `/api/*` route to the upstream
 * api-server, attaching the patient's Bearer token. Returns a 401 immediately
 * if no session cookie is present.
 *
 * Usage:
 *   export async function POST(req: NextRequest) {
 *     return proxyAuthed("/api/v1/patient/appointments", {
 *       method: "POST",
 *       body: await req.text(),
 *     });
 *   }
 */
export async function proxyAuthed(
  path: string,
  init?: RequestInit,
): Promise<NextResponse> {
  const session = getPatientSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }
  const upstream = await patientFetch(session, path, init);
  return passthrough(upstream);
}

/** Proxy a public (no-auth) call. Same shape as `proxyAuthed`. */
export async function proxyPublic(
  path: string,
  init?: RequestInit,
): Promise<NextResponse> {
  const upstream = await publicFetch(path, init);
  return passthrough(upstream);
}

// ────────────────────────────────────────────────────────────────────────────
// Session cookie — keep the patient session shape in exactly one place.
// ────────────────────────────────────────────────────────────────────────────

type SessionPayload = {
  token: string;
  expires_at: string;
  tenant: { id: string; slug: string; name: string };
  patient: { id: string; hn: string; first_name: string; last_name: string };
};

/**
 * Persist the patient session cookie. Used by both phone-OTP login and
 * guest-booking server actions — they used to do this inline with slight
 * differences in cookie options, which is exactly the kind of drift this
 * helper exists to prevent.
 */
export function setPatientSessionCookie(s: SessionPayload): void {
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
