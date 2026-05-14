"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

// ---- Phone lookup + phone login ----------------------------------------

export type PhoneLookupResult =
  | { ok: true; roles: Array<{ code: string; name: string }> }
  | { ok: false; error: string };

/** Step 1: given (tenant_slug, phone), return the list of roles for that
 *  phone. The client decides whether to show a role picker. */
export async function phoneLookupAction(input: {
  tenant_slug: string;
  phone: string;
}): Promise<PhoneLookupResult> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/phone/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { ok: false, error: body.error?.message ?? "Lookup failed" };
    }
    const body = (await res.json()) as {
      data: { roles: Array<{ code: string; name: string }> };
    };
    return { ok: true, roles: body.data.roles };
  } catch (err) {
    return {
      ok: false,
      error: `Cannot reach API server: ${(err as Error).message}`,
    };
  }
}

export type PhoneLoginResult =
  | { ok: true }
  | { ok: false; error: string };

/** Step 2: submit OTP. On success the cookie is set and the client navigates
 *  to `/` which then redirects ADMIN → /admin etc. */
export async function phoneLoginAction(input: {
  tenant_slug: string;
  phone: string;
  otp: string;
  role_code?: string;
}): Promise<PhoneLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/auth/phone/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(input),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Cannot reach API server: ${(err as Error).message}`,
    };
  }
  if (!res.ok) {
    let msg = "Login failed";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      msg = body.error?.message ?? msg;
    } catch {
      /* ignore */
    }
    return { ok: false, error: msg };
  }
  const body = (await res.json()) as {
    data: {
      token: string;
      expiresAt: string;
      tenant: { id: string; slug: string; name: string };
      // Backend deliberately does NOT return email (phone is the identity).
      user: { id: string; fullName: string };
      branches: Array<{ id: string; code: string; name: string }>;
      roles: string[];
    };
  };
  const d = body.data;
  const branchPick = d.branches[0];
  if (!branchPick) return { ok: false, error: "No accessible branch" };
  const session = {
    tenantId: d.tenant.id,
    tenantName: d.tenant.name,
    branchId: branchPick.id,
    branchName: branchPick.name,
    userId: d.user.id,
    userName: d.user.fullName,
    roles: d.roles,
    branches: d.branches,
    token: d.token,
  };
  cookies().set(
    SESSION_COOKIE,
    JSON.stringify(session),
    SESSION_COOKIE_OPTIONS,
  );
  return { ok: true };
}

// NOTE: the legacy `loginAction` (email + password POST to /api/v1/auth/login)
// was removed when we switched to phone+OTP in Phase H. If you're looking for
// it in git history, it lived here until that phase. Use `phoneLookupAction` +
// `phoneLoginAction` above. The shared `logoutAction` lives in
// `src/app/actions.ts` and is consumed by the user menu.
