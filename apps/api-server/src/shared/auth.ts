import { prisma } from "@legacyx/db";
import { Forbidden } from "./errors";
import type { RequestContext } from "./context";

export type PermissionRequest = {
  resource: string;
  action: string;
  /** ScopeTarget supplies fields needed for branch/self scope checks. */
  target?: { branchId?: string | null; ownerUserId?: string | null };
};

type CachedPermissions = {
  branchIds: Set<string>;
  perms: Map<string, Set<"tenant" | "branch" | "self">>; // key = "resource:action" → scopes
};

const cache = new Map<string, CachedPermissions>();

async function loadPermissions(
  tenantId: string,
  userId: string,
): Promise<CachedPermissions> {
  const cacheKey = `${tenantId}:${userId}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const [userRoles, branchRows] = await Promise.all([
    prisma.userRole.findMany({
      where: { userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    }),
    prisma.userBranchAccess.findMany({ where: { userId } }),
  ]);

  const perms = new Map<string, Set<"tenant" | "branch" | "self">>();
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      const key = `${rp.permission.resource}:${rp.permission.action}`;
      const set = perms.get(key) ?? new Set();
      set.add(rp.permission.scope as "tenant" | "branch" | "self");
      perms.set(key, set);
    }
  }
  const result: CachedPermissions = {
    branchIds: new Set(branchRows.map((b) => b.branchId)),
    perms,
  };
  cache.set(cacheKey, result);
  return result;
}

/** Clear cache (call after role/permission changes). */
export function invalidatePermissionCache(tenantId: string, userId: string): void {
  cache.delete(`${tenantId}:${userId}`);
}

/**
 * ABAC check. Throws Forbidden on denial.
 * Scope precedence: tenant > branch > self (broader scope wins).
 */
export async function authorize(
  ctx: RequestContext,
  req: PermissionRequest,
): Promise<void> {
  // SYSTEM actor bypasses (used by workers/cron). Real prod should still validate.
  if (ctx.actor.type === "SYSTEM") return;
  if (!ctx.actor.id) throw Forbidden("No actor identity");

  const { perms, branchIds } = await loadPermissions(ctx.tenantId, ctx.actor.id);
  const key = `${req.resource}:${req.action}`;
  const scopes = perms.get(key);
  if (!scopes || scopes.size === 0) {
    throw Forbidden(`Missing permission: ${key}`);
  }

  if (scopes.has("tenant")) return;

  if (scopes.has("branch")) {
    const target = req.target?.branchId ?? ctx.branchId;
    if (!target) throw Forbidden(`${key} requires a branch context`);
    if (!branchIds.has(target)) {
      throw Forbidden(`No access to branch ${target}`);
    }
    return;
  }

  if (scopes.has("self")) {
    if (req.target?.ownerUserId && req.target.ownerUserId === ctx.actor.id) return;
    throw Forbidden(`${key} requires self-owned target`);
  }

  throw Forbidden(`Unable to satisfy scope for ${key}`);
}
