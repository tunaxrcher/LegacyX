import { cookies } from "next/headers";

export type SessionBranch = { id: string; code: string; name: string };

export type Session = {
  tenantId: string;
  tenantName?: string;
  branchId: string;
  branchName?: string;
  userId: string;
  userName?: string;
  /** Role codes (e.g. ["DOCTOR"]). Used for client-side nav filtering only —
   *  the API still enforces ABAC server-side. */
  roles?: string[];
  /** All branches the user has access to — drives the branch picker. */
  branches?: SessionBranch[];
  /** Opaque session token issued by /api/v1/auth/login (Phase 6). */
  token?: string;
};

const COOKIE_KEY = "lx_session";

export function getSessionFromCookies(): Session | null {
  const c = cookies().get(COOKIE_KEY);
  if (!c) return null;
  try {
    // Cookie may be raw JSON (httpOnly cookies set via Next) OR URL-encoded JSON
    // (legacy client-side document.cookie writes). Try both.
    try {
      return JSON.parse(c.value);
    } catch {
      return JSON.parse(decodeURIComponent(c.value));
    }
  } catch {
    return null;
  }
}

/** Convert a session into the headers expected by api-server. */
export function sessionHeaders(s: Session): Record<string, string> {
  const h: Record<string, string> = {
    "x-tenant-id": s.tenantId,
    "x-branch-id": s.branchId,
    "x-user-id": s.userId,
  };
  if (s.token) h["authorization"] = `Bearer ${s.token}`;
  return h;
}

export const SESSION_COOKIE = COOKIE_KEY;

/**
 * Single source of truth for how we persist the session cookie. Used by
 * `phoneLoginAction` and `switchBranchAction`.
 *
 * NOTE: not httpOnly so client-side `clientApi` (in components) can read the
 * bearer token via `document.cookie`. The token IS still validated server-side
 * against the Session table on every API request — see `getRequestContext()`.
 * Future hardening (move all mutations to server actions) would let us set
 * httpOnly = true.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 12,
};
