import { z } from "zod";
import { prisma } from "@legacyx/db";
import {
  generateSessionToken,
  hashSessionToken,
  verifyPassword,
} from "../../shared/password";
import { BadRequest, Unauthorized, NotFound } from "../../shared/errors";

export const LoginDto = z.object({
  tenant_slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export async function login(
  input: z.infer<typeof LoginDto>,
  meta: { ip?: string; userAgent?: string } = {},
) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: input.tenant_slug },
  });
  if (!tenant) throw Unauthorized("Invalid credentials");

  const user = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      email: input.email.toLowerCase(),
      deletedAt: null,
    },
  });
  if (!user || !user.passwordHash) throw Unauthorized("Invalid credentials");
  if (user.status !== "ACTIVE") throw Unauthorized(`Account is ${user.status}`);

  if (!verifyPassword(input.password, user.passwordHash)) {
    throw Unauthorized("Invalid credentials");
  }

  // Allowed branches + role codes (sent to client for nav filtering)
  const [access, userRoles] = await Promise.all([
    prisma.userBranchAccess.findMany({ where: { userId: user.id } }),
    prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    }),
  ]);
  const branchRows = access.length
    ? await prisma.branch.findMany({
        where: { id: { in: access.map((a) => a.branchId) } },
      })
    : [];
  const branches = branchRows.map((b) => ({ id: b.id, code: b.code, name: b.name }));
  const roles = userRoles.map((r) => r.role.code);
  if (branches.length === 0) {
    throw Unauthorized("User has no branch access — contact administrator");
  }

  // Create session
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "auth.login",
      resourceType: "User",
      resourceId: user.id,
      after: { ip: meta.ip ?? null } as object,
    },
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    user: { id: user.id, email: user.email, fullName: user.fullName },
    branches,
    roles,
  };
}

export async function logout(token: string) {
  if (!token) throw BadRequest("missing token");
  const tokenHash = hashSessionToken(token);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(token: string) {
  if (!token) throw Unauthorized("missing token");
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw Unauthorized("session invalid or expired");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user || user.status !== "ACTIVE") throw Unauthorized("user inactive");

  const [tenant, userRoles, access] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
    prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    }),
    prisma.userBranchAccess.findMany({ where: { userId: user.id } }),
  ]);
  const branchRows = access.length
    ? await prisma.branch.findMany({
        where: { id: { in: access.map((a) => a.branchId) } },
      })
    : [];

  return {
    tenant: tenant
      ? { id: tenant.id, slug: tenant.slug, name: tenant.name }
      : null,
    user: { id: user.id, email: user.email, fullName: user.fullName },
    roles: userRoles.map((r) => ({ code: r.role.code, name: r.role.name })),
    branches: branchRows.map((b) => ({ id: b.id, code: b.code, name: b.name })),
    sessionExpiresAt: session.expiresAt.toISOString(),
  };
}

/** Resolve a token to userId + tenantId for use by getRequestContext. */
export async function resolveSession(
  token: string,
): Promise<{ userId: string; tenantId: string } | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { select: { tenantId: true, status: true } } },
  });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return { userId: session.userId, tenantId: session.user.tenantId };
}
