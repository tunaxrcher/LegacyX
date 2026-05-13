"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { localeCookie, locales, type Locale } from "@/i18n/config";
import { SESSION_COOKIE_OPTIONS } from "@/lib/session";

const SESSION_COOKIE = "lx_session";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function logoutAction() {
  // Revoke the server-side session if we have a token (Phase 6 real auth)
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
      /* ignore — best-effort revoke */
    }
  }
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}

/**
 * Switch active branch on the same session. The user must already have access
 * to the requested branch (we re-validate against the persisted `branches`
 * list in the cookie — the API still enforces ABAC).
 */
export async function switchBranchAction(branchId: string) {
  const c = cookies().get(SESSION_COOKIE);
  if (!c) {
    redirect("/login");
  }
  let session: {
    tenantId: string;
    tenantName?: string;
    branchId: string;
    branchName?: string;
    userId: string;
    userName?: string;
    roles?: string[];
    branches?: Array<{ id: string; code: string; name: string }>;
    token?: string;
  };
  try {
    session = JSON.parse(c!.value);
  } catch {
    redirect("/login");
    return;
  }
  const next = session.branches?.find((b) => b.id === branchId);
  if (!next) return; // not allowed — silently no-op

  session.branchId = next.id;
  session.branchName = next.name;
  cookies().set(SESSION_COOKIE, JSON.stringify(session), SESSION_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
}

export async function setLocaleAction(locale: string) {
  if (!(locales as readonly string[]).includes(locale)) return;
  cookies().set(localeCookie, locale as Locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
