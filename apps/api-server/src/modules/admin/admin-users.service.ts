import { z } from "zod";
import { prisma } from "@legacyx/db";
import { BadRequest, Conflict, Forbidden, NotFound } from "../../shared/errors";
import { authorize, invalidatePermissionCache } from "../../shared/auth";
import { hashPassword } from "../../shared/password";
import { normalizePhone, searchableHash } from "@legacyx/db";
import type { RequestContext } from "../../shared/context";

/**
 * Admin user CRUD.
 *
 * Auth model (v2 — phone-based, Phase H):
 *   • Login is **phone + OTP**. The `User.email` column is gone — phone is
 *     the sole identity field.
 *   • Each user has exactly ONE role (`primaryRoleCode`). Same phone may
 *     appear on multiple user rows IF the role differs — e.g. Dr Foo logs in
 *     as a Doctor OR a Manager. The uniqueness boundary is
 *     `(tenantId, phone, primaryRoleCode)`.
 *   • The `ADMIN` role cannot be assigned through this service — UI hides it,
 *     and `createUser` / `updateUser` reject it server-side (defense in depth).
 *   • Avatar URL is optional and uploaded via the `/api/v1/uploads/avatar`
 *     route, which writes to DO Spaces.
 *
 * Role separation (Phase Q):
 *   • Both ADMIN and MANAGER hold `user:write:tenant` — but MANAGER cannot
 *     escalate. The role-allowlist below is the SoD guardrail.
 *
 *      ADMIN   → may create / edit MANAGER, DOCTOR, NURSE, RECEPTION,
 *                PHARMACIST (all non-ADMIN roles; ADMIN itself is
 *                provisioned via the seed only).
 *      MANAGER → may create / edit DOCTOR, NURSE, RECEPTION, PHARMACIST.
 *                MANAGER and ADMIN are off-limits (no peer-edit, no
 *                self-promotion). They CAN _list_ other MANAGERs as peers
 *                but every mutation enforces the allowlist server-side.
 *
 * The legacy `UserRole` table is still maintained (kept as a 1-row mirror of
 * `primaryRoleCode`) so existing role-aware code keeps working unchanged.
 */

/** Operational, non-privileged roles a Manager may create/edit. */
const MANAGER_ASSIGNABLE_ROLES = ["DOCTOR", "NURSE", "RECEPTION", "PHARMACIST"] as const;
/** Roles a Manager may *see* in the list (peers + operational staff). */
const MANAGER_VISIBLE_ROLES = ["MANAGER", ...MANAGER_ASSIGNABLE_ROLES] as const;

/** Look up the actor's primary role code (cached path is fine — `User` row). */
async function getActorRoleCode(ctx: RequestContext): Promise<string | null> {
  if (!ctx.actor.id) return null;
  const u = await prisma.user.findFirst({
    where: { id: ctx.actor.id, tenantId: ctx.tenantId },
    select: { primaryRoleCode: true },
  });
  return u?.primaryRoleCode ?? null;
}

/**
 * Roles whose users this actor may LIST. Always excludes ADMIN unless the
 * actor is themselves ADMIN (ADMINs are not surfaced to managers).
 */
export function getVisibleRoleCodes(actorRoleCode: string | null): readonly string[] {
  if (actorRoleCode === "ADMIN") {
    return ["ADMIN", "MANAGER", ...MANAGER_ASSIGNABLE_ROLES];
  }
  if (actorRoleCode === "MANAGER") return MANAGER_VISIBLE_ROLES;
  return [];
}

/**
 * Roles this actor may CREATE / ASSIGN to a user. Stricter than visibility
 * — Manager can see their peers but cannot create another Manager.
 */
export function getAssignableRoleCodes(
  actorRoleCode: string | null,
): readonly string[] {
  if (actorRoleCode === "ADMIN") {
    // ADMIN may assign any non-ADMIN role. ADMIN itself is seed-only.
    return ["MANAGER", ...MANAGER_ASSIGNABLE_ROLES];
  }
  if (actorRoleCode === "MANAGER") return MANAGER_ASSIGNABLE_ROLES;
  return [];
}

function assertCanAssign(actorRoleCode: string | null, targetRoleCode: string) {
  const allowed = getAssignableRoleCodes(actorRoleCode);
  if (!allowed.includes(targetRoleCode)) {
    throw Forbidden(
      `Role ${actorRoleCode ?? "(none)"} may not assign role ${targetRoleCode}`,
    );
  }
}

function assertCanManageTargetRole(
  actorRoleCode: string | null,
  targetCurrentRole: string | null,
) {
  if (!targetCurrentRole) return;
  const allowed = getAssignableRoleCodes(actorRoleCode);
  if (!allowed.includes(targetCurrentRole)) {
    throw Forbidden(
      `Role ${actorRoleCode ?? "(none)"} may not modify users with role ${targetCurrentRole}`,
    );
  }
}

// ---- DTOs --------------------------------------------------------------

export const CreateUserDto = z.object({
  phone: z.string().min(4).max(32),
  full_name: z.string().min(1).max(120),
  /** Single role per user. */
  role_code: z.string().min(1).max(64),
  /** Optional profile picture. */
  avatar_url: z.string().url().max(512).optional(),
  /** Password is optional — phone+OTP is the canonical login. */
  password: z.string().min(8).max(128).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).default("ACTIVE"),
  branch_ids: z.array(z.string()).min(1),
});

export const UpdateUserDto = z.object({
  full_name: z.string().min(1).max(120).optional(),
  phone: z.string().min(4).max(32).optional(),
  avatar_url: z.string().url().max(512).optional().nullable(),
  role_code: z.string().min(1).max(64).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional(),
});

export const AssignBranchesDto = z.object({
  branch_ids: z.array(z.string()),
});
export const ResetPasswordDto = z.object({
  new_password: z.string().min(8).max(128),
});

// ---- Queries -----------------------------------------------------------

export interface ListUsersFilters {
  q?: string;
  role?: string;
  status?: string;
  /** 1-indexed page number. Caller must clamp ≥ 1. */
  page: number;
  /** Items per page. Caller must clamp + cap. */
  perPage: number;
}

export async function listUsers(
  ctx: RequestContext,
  filters: ListUsersFilters,
) {
  await authorize(ctx, { resource: "user", action: "read", target: {} });

  // SoD filter — managers must not see ADMIN rows. Empty allowlist (= no
  // visible roles) returns nothing; that path is only reachable if the
  // actor somehow holds `user:read` without being ADMIN/MANAGER.
  const actorRole = await getActorRoleCode(ctx);
  const visibleRoles = getVisibleRoleCodes(actorRole);

  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    deletedAt: null,
  };
  if (visibleRoles.length > 0) {
    where.primaryRoleCode = { in: [...visibleRoles] };
  }
  // Caller may further restrict by role (within visible set).
  if (filters.role && (visibleRoles.length === 0 || visibleRoles.includes(filters.role as never))) {
    where.primaryRoleCode = filters.role;
  }
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    where.OR = [
      { fullName: { contains: filters.q } },
      { phone: { contains: filters.q } },
    ];
  }

  const { page, perPage } = filters;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  const userIds = users.map((u) => u.id);
  const [userRoles, access, branches] = await Promise.all([
    prisma.userRole.findMany({
      where: { userId: { in: userIds } },
      include: { role: true },
    }),
    prisma.userBranchAccess.findMany({ where: { userId: { in: userIds } } }),
    prisma.branch.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, code: true, name: true },
    }),
  ]);
  const branchMap = new Map(branches.map((b) => [b.id, b]));
  const rolesByUser = new Map<string, Array<{ code: string; name: string }>>();
  for (const r of userRoles) {
    const arr = rolesByUser.get(r.userId) ?? [];
    arr.push({ code: r.role.code, name: r.role.name });
    rolesByUser.set(r.userId, arr);
  }
  const branchesByUser = new Map<
    string,
    Array<{ id: string; code: string; name: string }>
  >();
  for (const a of access) {
    const b = branchMap.get(a.branchId);
    if (!b) continue;
    const arr = branchesByUser.get(a.userId) ?? [];
    arr.push(b);
    branchesByUser.set(a.userId, arr);
  }

  const data = users.map((u) => ({
    id: u.id,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    fullName: u.fullName,
    status: u.status,
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    hasPassword: !!u.passwordHash,
    primaryRoleCode: u.primaryRoleCode,
    roles: rolesByUser.get(u.id) ?? [],
    branches: branchesByUser.get(u.id) ?? [],
  }));
  return { data, pagination: { total, page, perPage } };
}

export async function listRolesWithPermissions(ctx: RequestContext) {
  await authorize(ctx, { resource: "user", action: "read", target: {} });
  // Same SoD rule — Manager doesn't get to enumerate ADMIN's permissions
  // even read-only; nothing actionable comes from showing it.
  const actorRole = await getActorRoleCode(ctx);
  const visibleRoles = getVisibleRoleCodes(actorRole);
  const roles = await prisma.role.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(visibleRoles.length > 0 ? { code: { in: [...visibleRoles] } } : {}),
    },
    orderBy: { code: "asc" },
  });
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: { in: roles.map((r) => r.id) } },
    include: { permission: true },
  });
  const userCounts = await prisma.userRole.groupBy({
    by: ["roleId"],
    where: { roleId: { in: roles.map((r) => r.id) } },
    _count: { _all: true },
  });
  const countMap = new Map(userCounts.map((c) => [c.roleId, c._count._all]));

  const permsByRole = new Map<
    string,
    Array<{ resource: string; action: string; scope: string }>
  >();
  for (const rp of rolePerms) {
    const arr = permsByRole.get(rp.roleId) ?? [];
    arr.push({
      resource: rp.permission.resource,
      action: rp.permission.action,
      scope: rp.permission.scope,
    });
    permsByRole.set(rp.roleId, arr);
  }

  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isSystem: r.isSystem,
    userCount: countMap.get(r.id) ?? 0,
    permissions: (permsByRole.get(r.id) ?? []).sort(
      (a, b) =>
        a.resource.localeCompare(b.resource) ||
        a.action.localeCompare(b.action),
    ),
  }));
}

// ---- Commands ----------------------------------------------------------

export async function createUser(
  ctx: RequestContext,
  input: z.infer<typeof CreateUserDto>,
) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  // ADMIN is a system-only role — never assignable via the admin API.
  // (The single bootstrap ADMIN account is created by the seed at install
  // time. Promote-to-admin can only happen via direct DB / migration.)
  if (input.role_code === "ADMIN") {
    throw BadRequest("ADMIN role cannot be assigned from the UI");
  }

  // SoD allowlist — MANAGER may only create operational staff (DOCTOR /
  // NURSE / RECEPTION / PHARMACIST). Admin may create those + MANAGER.
  const actorRole = await getActorRoleCode(ctx);
  assertCanAssign(actorRole, input.role_code);

  // Validate role exists in this tenant.
  const role = await prisma.role.findFirst({
    where: { tenantId: ctx.tenantId, code: input.role_code },
  });
  if (!role) throw BadRequest(`Unknown role: ${input.role_code}`);

  // Validate branches.
  const branches = await prisma.branch.findMany({
    where: { tenantId: ctx.tenantId, id: { in: input.branch_ids } },
  });
  if (branches.length !== input.branch_ids.length) {
    throw BadRequest("Unknown branch id");
  }

  const phone = normalizePhone(input.phone);
  // Same phone is OK for a different role, but (phone, role) must be unique.
  const collision = await prisma.user.findFirst({
    where: {
      tenantId: ctx.tenantId,
      phone,
      primaryRoleCode: input.role_code,
      deletedAt: null,
    },
  });
  if (collision) {
    throw Conflict(
      `Phone ${phone} is already registered as ${input.role_code}`,
    );
  }

  const user = await prisma.user.create({
    data: {
      tenantId: ctx.tenantId,
      phone,
      phoneHash: searchableHash(ctx.tenantId, phone),
      primaryRoleCode: input.role_code,
      avatarUrl: input.avatar_url,
      fullName: input.full_name,
      passwordHash: input.password ? hashPassword(input.password) : null,
      status: input.status,
    },
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });
  await prisma.userBranchAccess.createMany({
    data: branches.map((b) => ({ userId: user.id, branchId: b.id })),
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.create",
      resourceType: "User",
      resourceId: user.id,
      correlationId: ctx.correlationId,
      after: {
        phone: user.phone,
        role: input.role_code,
        branches: input.branch_ids,
      } as object,
    },
  });

  return { id: user.id, phone: user.phone };
}

export async function updateUser(
  ctx: RequestContext,
  userId: string,
  input: z.infer<typeof UpdateUserDto>,
) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!u) throw NotFound(`User ${userId} not found`);

  // SoD — Manager cannot edit users whose role they couldn't have created in
  // the first place (so a Manager cannot lower the permissions of an ADMIN
  // to "lock them out", nor edit a peer Manager).
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);

  // Build the patch + check role/phone collisions when those fields change.
  let newRole: { id: string; code: string } | null = null;
  if (input.role_code && input.role_code !== u.primaryRoleCode) {
    // Same rationale as createUser — ADMIN is unreachable from the UI.
    if (input.role_code === "ADMIN") {
      throw BadRequest("ADMIN role cannot be assigned from the UI");
    }
    // SoD — and the new role must also be assignable by the actor (no
    // sneaky promote-to-MANAGER by a junior Manager).
    assertCanAssign(actorRole, input.role_code);
    const role = await prisma.role.findFirst({
      where: { tenantId: ctx.tenantId, code: input.role_code },
    });
    if (!role) throw BadRequest(`Unknown role: ${input.role_code}`);
    newRole = { id: role.id, code: role.code };
  }
  const newPhone = input.phone ? normalizePhone(input.phone) : null;
  if (newPhone || newRole) {
    const phoneCheck = newPhone ?? u.phone;
    const roleCheck = newRole?.code ?? u.primaryRoleCode;
    if (phoneCheck && roleCheck) {
      const collision = await prisma.user.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phone: phoneCheck,
          primaryRoleCode: roleCheck,
          deletedAt: null,
          NOT: { id: userId },
        },
      });
      if (collision) {
        throw Conflict(
          `Phone ${phoneCheck} is already registered as ${roleCheck}`,
        );
      }
    }
  }

  const before = {
    fullName: u.fullName,
    status: u.status,
    phone: u.phone,
    primaryRoleCode: u.primaryRoleCode,
    avatarUrl: u.avatarUrl,
  };
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: input.full_name ?? undefined,
      status: input.status ?? undefined,
      avatarUrl: input.avatar_url === undefined ? undefined : input.avatar_url,
      phone: newPhone ?? undefined,
      phoneHash: newPhone
        ? searchableHash(ctx.tenantId, newPhone)
        : undefined,
      primaryRoleCode: newRole?.code ?? undefined,
    },
  });

  if (newRole) {
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.create({
        data: { userId, roleId: newRole.id },
      }),
    ]);
  }

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.update",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      before: before as object,
      after: {
        fullName: updated.fullName,
        status: updated.status,
        phone: updated.phone,
        primaryRoleCode: updated.primaryRoleCode,
        avatarUrl: updated.avatarUrl,
      } as object,
    },
  });
  // Drop the in-process permission cache for this user so their next request
  // reflects the new role / status immediately (otherwise they keep their
  // previous permissions until the process restarts).
  invalidatePermissionCache(ctx.tenantId, userId);
  return { id: updated.id };
}

export async function assignBranches(
  ctx: RequestContext,
  userId: string,
  input: z.infer<typeof AssignBranchesDto>,
) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId },
  });
  if (!u) throw NotFound(`User ${userId} not found`);
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);

  const branches = input.branch_ids.length
    ? await prisma.branch.findMany({
        where: { tenantId: ctx.tenantId, id: { in: input.branch_ids } },
      })
    : [];
  if (branches.length !== input.branch_ids.length) {
    throw BadRequest("Unknown branch id");
  }

  await prisma.$transaction([
    prisma.userBranchAccess.deleteMany({ where: { userId } }),
    ...(branches.length
      ? [
          prisma.userBranchAccess.createMany({
            data: branches.map((b) => ({ userId, branchId: b.id })),
          }),
        ]
      : []),
  ]);

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.assign_branches",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      after: { branches: input.branch_ids } as object,
    },
  });
  // Branch access affects which branches the user can act in — drop cached
  // `branchIds` so the next request sees the new set.
  invalidatePermissionCache(ctx.tenantId, userId);
  return { ok: true };
}

export async function resetUserPassword(
  ctx: RequestContext,
  userId: string,
  input: z.infer<typeof ResetPasswordDto>,
) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!u) throw NotFound(`User ${userId} not found`);
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(input.new_password) },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.reset_password",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
    },
  });
  return { ok: true };
}

/**
 * Quick admin recovery actions (Phase Q):
 *
 *   • unlockUser — flips status LOCKED → ACTIVE. Useful when a user gets
 *     locked out by repeated bad-OTP attempts (today the lockout transition
 *     happens manually; once the auth flow tracks failed-attempt counters it
 *     will be set automatically and this action becomes the standard way out).
 *   • revokeUserSessions — invalidates every active session for the user.
 *     Replaces the missing "force logout" / "phone got stolen" workflow that
 *     would otherwise require a password reset (which we don't always want
 *     for OTP-only users).
 *
 * Both share the same SoD rule: an actor may only run them on a user whose
 * role they could have created. Audit log is mandatory.
 */
export async function unlockUser(ctx: RequestContext, userId: string) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!u) throw NotFound(`User ${userId} not found`);
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);

  if (u.status !== "LOCKED") {
    // No-op so the UI is idempotent — nothing to undo.
    return { ok: true, changed: false, status: u.status };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.unlock",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      before: { status: "LOCKED" } as object,
      after: { status: "ACTIVE" } as object,
    },
  });
  invalidatePermissionCache(ctx.tenantId, userId);
  return { ok: true, changed: true, status: "ACTIVE" as const };
}

/**
 * Retire (soft-deactivate) a user — typical "พนักงานลาออก" flow.
 *
 * We deliberately do NOT expose a hard-delete from the UI. The User row
 * is referenced from Visit (doctor), EMR notes (signed_by), AuditLog
 * (actor), Session, ResourceReservation (created_by), Payment (received_by)
 * etc. — destroying it would either orphan FKs or wipe audit trails that
 * the law requires us to keep for 7 years.
 *
 * What we DO:
 *   • flip `status` to INACTIVE so the user disappears from the active
 *     KPI count and cannot log in
 *   • revoke every active session so the user is signed out everywhere
 *   • write a `user.retire` audit row + invalidate the permission cache
 *
 * Reverse with `reactivateUser` (status INACTIVE → ACTIVE). That round-
 * trip is fully non-destructive — no data is lost in either direction.
 */
export async function retireUser(ctx: RequestContext, userId: string) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!u) throw NotFound(`User ${userId} not found`);
  // SoD — same allowlist as everywhere else; managers cannot retire ADMIN
  // or peer Manager rows.
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);
  // Belt-and-braces self-retire guard. The actor allowlist already blocks
  // a Manager from retiring another Manager (including themselves), but
  // an ADMIN could theoretically retire themselves and lock themselves
  // out of their own tenant. Refuse explicitly.
  if (u.id === ctx.actor.id) {
    throw BadRequest("You cannot retire your own account");
  }

  if (u.status === "INACTIVE") {
    return { ok: true, changed: false, status: u.status };
  }

  const sessions = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { status: "INACTIVE" },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.retire",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      before: { status: u.status } as object,
      after: {
        status: "INACTIVE",
        revokedSessions: sessions.count,
      } as object,
    },
  });
  invalidatePermissionCache(ctx.tenantId, userId);
  return {
    ok: true,
    changed: true,
    status: "INACTIVE" as const,
    revokedSessions: sessions.count,
  };
}

/**
 * Reverse of `retireUser` — flips an INACTIVE user back to ACTIVE so they
 * can log in again. Common when staff come back after a leave or rehire.
 * Does NOT touch sessions (those were revoked at retire time and a fresh
 * login will mint new ones via the normal phone+OTP flow).
 */
export async function reactivateUser(ctx: RequestContext, userId: string) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!u) throw NotFound(`User ${userId} not found`);
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);

  if (u.status === "ACTIVE") {
    return { ok: true, changed: false, status: u.status };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.reactivate",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      before: { status: u.status } as object,
      after: { status: "ACTIVE" } as object,
    },
  });
  invalidatePermissionCache(ctx.tenantId, userId);
  return { ok: true, changed: true, status: "ACTIVE" as const };
}

export async function revokeUserSessions(ctx: RequestContext, userId: string) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!u) throw NotFound(`User ${userId} not found`);
  const actorRole = await getActorRoleCode(ctx);
  assertCanManageTargetRole(actorRole, u.primaryRoleCode);

  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.revoke_sessions",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      after: { revokedSessions: result.count } as object,
    },
  });
  return { ok: true, revoked: result.count };
}
