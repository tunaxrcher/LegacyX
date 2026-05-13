import { z } from "zod";
import { prisma } from "@legacyx/db";
import {
  BadRequest,
  Conflict,
  NotFound,
} from "../../shared/errors";
import { authorize } from "../../shared/auth";
import { hashPassword } from "../../shared/password";
import type { RequestContext } from "../../shared/context";

export const CreateUserDto = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).default("ACTIVE"),
  role_codes: z.array(z.string()).default([]),
  branch_ids: z.array(z.string()).min(1),
});

export const UpdateUserDto = z.object({
  full_name: z.string().min(1).max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional(),
});

export const AssignRolesDto = z.object({
  role_codes: z.array(z.string()),
});
export const AssignBranchesDto = z.object({
  branch_ids: z.array(z.string()),
});
export const ResetPasswordDto = z.object({
  new_password: z.string().min(8).max(128),
});

// ---------- Queries ----------

export async function listUsers(ctx: RequestContext) {
  await authorize(ctx, { resource: "user", action: "read", target: {} });

  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null },
    orderBy: [{ status: "asc" }, { email: "asc" }],
  });

  const userIds = users.map((u) => u.id);
  const [userRoles, access, branches] = await Promise.all([
    prisma.userRole.findMany({
      where: { userId: { in: userIds } },
      include: { role: true },
    }),
    prisma.userBranchAccess.findMany({
      where: { userId: { in: userIds } },
    }),
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
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    hasPassword: !!u.passwordHash,
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
        a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action),
    ),
  }));
}

// ---------- Commands ----------

export async function createUser(
  ctx: RequestContext,
  input: z.infer<typeof CreateUserDto>,
) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const existing = await prisma.user.findFirst({
    where: {
      tenantId: ctx.tenantId,
      email: input.email.toLowerCase(),
    },
  });
  if (existing) throw Conflict(`Email ${input.email} already used`);

  // Validate role codes
  const roles = input.role_codes.length
    ? await prisma.role.findMany({
        where: { tenantId: ctx.tenantId, code: { in: input.role_codes } },
      })
    : [];
  if (roles.length !== input.role_codes.length) {
    throw BadRequest("Unknown role code");
  }
  // Validate branches
  const branches = await prisma.branch.findMany({
    where: { tenantId: ctx.tenantId, id: { in: input.branch_ids } },
  });
  if (branches.length !== input.branch_ids.length) {
    throw BadRequest("Unknown branch id");
  }

  const user = await prisma.user.create({
    data: {
      tenantId: ctx.tenantId,
      email: input.email.toLowerCase(),
      fullName: input.full_name,
      passwordHash: hashPassword(input.password),
      status: input.status,
    },
  });

  if (roles.length) {
    await prisma.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
  }
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
        email: user.email,
        roles: input.role_codes,
        branches: input.branch_ids,
      } as object,
    },
  });

  return { id: user.id, email: user.email };
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

  const before = { fullName: u.fullName, status: u.status };
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: input.full_name ?? undefined,
      status: input.status ?? undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.update",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      before: before as object,
      after: { fullName: updated.fullName, status: updated.status } as object,
    },
  });
  return { id: updated.id };
}

export async function assignRoles(
  ctx: RequestContext,
  userId: string,
  input: z.infer<typeof AssignRolesDto>,
) {
  await authorize(ctx, { resource: "user", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const u = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId },
  });
  if (!u) throw NotFound(`User ${userId} not found`);

  const roles = input.role_codes.length
    ? await prisma.role.findMany({
        where: { tenantId: ctx.tenantId, code: { in: input.role_codes } },
      })
    : [];
  if (roles.length !== input.role_codes.length) {
    throw BadRequest("Unknown role code");
  }

  // Replace strategy: delete old, insert new
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    ...(roles.length
      ? [
          prisma.userRole.createMany({
            data: roles.map((r) => ({ userId, roleId: r.id })),
          }),
        ]
      : []),
  ]);

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "user.assign_roles",
      resourceType: "User",
      resourceId: userId,
      correlationId: ctx.correlationId,
      after: { roles: input.role_codes } as object,
    },
  });
  return { ok: true };
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
  // Revoke all current sessions for this user
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
