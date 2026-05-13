import { headers } from "next/headers";
import { ulid } from "ulid";
import { resolveSession } from "../modules/auth/auth.service";

export type Actor = {
  type: "USER" | "SYSTEM" | "PATIENT" | "AI";
  id: string | null;
};

export type RequestContext = {
  correlationId: string;
  tenantId: string;
  branchId?: string;
  actor: Actor;
};

/**
 * Resolve the per-request context from auth headers.
 *
 * Phase 6+ enforcement:
 *   - If `Authorization: Bearer <token>` (or `x-session-token`) is present,
 *     we look up the Session in the DB. The token IS the source of truth
 *     for tenantId + userId; any conflicting x-tenant-id / x-user-id headers
 *     are rejected as Forbidden (prevents header spoofing).
 *   - Branch id still comes from `x-branch-id` (frontend lets users switch
 *     between accessible branches in a single session).
 *   - Without a token, falls back to header-only mode (used by internal
 *     worker callbacks and dev tooling).
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = headers();
  const correlationId = h.get("x-correlation-id") ?? ulid();

  const auth = h.get("authorization") ?? "";
  const tokenFromAuth = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const token = tokenFromAuth || h.get("x-session-token") || "";

  const claimedTenantId = h.get("x-tenant-id") ?? undefined;
  const claimedUserId = h.get("x-user-id") ?? undefined;
  const branchId = h.get("x-branch-id") ?? undefined;

  if (token) {
    const sess = await resolveSession(token);
    if (!sess) {
      throw new ContextError("Invalid or expired session token", 401);
    }
    // If the client also sent x-tenant-id / x-user-id, they must match — we do
    // NOT trust them; the token is authoritative.
    if (claimedTenantId && claimedTenantId !== sess.tenantId) {
      throw new ContextError("Tenant mismatch with session token", 403);
    }
    if (claimedUserId && claimedUserId !== sess.userId) {
      throw new ContextError("User mismatch with session token", 403);
    }
    return {
      tenantId: sess.tenantId,
      branchId,
      correlationId,
      actor: { type: "USER", id: sess.userId },
    };
  }

  // No token → legacy header-only mode (worker, internal tests). We still
  // require a tenant-id so cross-tenant queries are impossible.
  if (!claimedTenantId) {
    throw new ContextError(
      "Missing authentication — provide Authorization: Bearer <token> or x-tenant-id",
      401,
    );
  }
  return {
    tenantId: claimedTenantId,
    branchId,
    correlationId,
    actor: {
      type: claimedUserId ? "USER" : "SYSTEM",
      id: claimedUserId ?? null,
    },
  };
}

export class ContextError extends Error {
  override readonly name = "ContextError";
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Assert that the context has an authenticated user attached. Used by mutation
 * services that need to write audit logs / set createdBy. Throws Unauthorized
 * (401) if the request is anonymous (SYSTEM actor).
 */
export function getActorOrThrow(ctx: RequestContext): string {
  if (!ctx.actor.id || ctx.actor.type !== "USER") {
    throw new ContextError("Authenticated user required for this action", 401);
  }
  return ctx.actor.id;
}

/**
 * Assert that the context has a branch attached. Used by branch-scoped
 * services (most of them). Throws BadRequest if missing.
 */
export function getBranchOrThrow(ctx: RequestContext): string {
  if (!ctx.branchId) {
    throw new ContextError("Branch context required (x-branch-id)", 400);
  }
  return ctx.branchId;
}
