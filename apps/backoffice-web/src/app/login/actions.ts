"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
      user: { id: string; email: string | null; fullName: string };
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

export type LoginResult =
  | { ok: true; submitted: boolean }
  | { ok: false; error: string };

/**
 * useFormState-compatible signature. Returns a result the client renders /
 * uses to redirect — we deliberately DO NOT call `redirect()` here because
 * the redirect throw conflicts with the useFormState state machine, which is
 * why the "Invalid Server Actions request" error appears on success.
 */
export async function loginAction(
  _prevState: LoginResult,
  formData: FormData,
): Promise<LoginResult> {
  const tenantSlug = String(formData.get("tenant_slug") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const preferredBranchId = String(formData.get("branch_id") ?? "").trim();

  if (!tenantSlug || !email || !password) {
    return { ok: false, error: "Missing required fields" };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ tenant_slug: tenantSlug, email, password }),
    });
  } catch (err) {
    return { ok: false, error: `Cannot reach API server: ${(err as Error).message}` };
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
      user: { id: string; email: string; fullName: string };
      branches: Array<{ id: string; code: string; name: string }>;
      roles: string[];
    };
  };
  const d = body.data;
  const branchPick =
    d.branches.find((b) => b.id === preferredBranchId) ?? d.branches[0];
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
  cookies().set(SESSION_COOKIE, JSON.stringify(session), SESSION_COOKIE_OPTIONS);
  // Do NOT redirect() here — client will navigate via useEffect on success.
  return { ok: true, submitted: true };
}

export async function logoutAction() {
  const c = cookies().get(SESSION_COOKIE);
  if (c) {
    try {
      const session = JSON.parse(c.value) as { token?: string };
      if (session.token) {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: "POST",
          headers: { authorization: `Bearer ${session.token}` },
          cache: "no-store",
        }).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
