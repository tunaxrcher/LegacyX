import { z } from "zod";
import { prisma } from "@legacyx/db";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
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
 * The legacy `UserRole` table is still maintained (kept as a 1-row mirror of
 * `primaryRoleCode`) so existing role-aware code keeps working unchanged.
 */

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

export async function listUsers(ctx: RequestContext) {
  await authorize(ctx, { resource: "user", action: "read", target: {} });

  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null },
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
  });

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

  return users.map((u) => ({
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
}

export async function listRolesWithPermissions(ctx: RequestContext) {
  await authorize(ctx, { resource: "user", action: "read", target: {} });
  const roles = await prisma.role.findMany({
    where: { tenantId: ctx.tenantId },
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

  // Build the patch + check role/phone collisions when those fields change.
  let newRole: { id: string; code: string } | null = null;
  if (input.role_code && input.role_code !== u.primaryRoleCode) {
    // Same rationale as createUser — ADMIN is unreachable from the UI.
    if (input.role_code === "ADMIN") {
      throw BadRequest("ADMIN role cannot be assigned from the UI");
    }
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
