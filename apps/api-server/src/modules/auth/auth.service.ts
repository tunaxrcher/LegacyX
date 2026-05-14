import { z } from "zod";
import { prisma } from "@legacyx/db";
import {
  generateSessionToken,
  hashSessionToken,
} from "../../shared/password";
import { BadRequest, Unauthorized } from "../../shared/errors";
import { searchableHash } from "../../shared/crypto";

// ---- DTOs --------------------------------------------------------------

export const PhoneLookupDto = z.object({
  tenant_slug: z.string().min(1),
  phone: z.string().min(4).max(32),
});

export const PhoneLoginDto = z.object({
  tenant_slug: z.string().min(1),
  phone: z.string().min(4).max(32),
  /// Required only when the phone is associated with multiple users (different
  /// roles). The client sends the chosen role code so we pick the right user.
  role_code: z.string().min(1).max(64).optional(),
  /// 6-digit OTP. Until the SMS provider is wired we accept "123456" for any
  /// phone in dev mode (DEV_OTP env). Production will validate against the
  /// last-issued OTP row.
  otp: z.string().min(4).max(8),
});

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function normalizePhone(raw: string): string {
  return raw.trim().replace(/[^\d+]/g, "");
}

// Dev / staging convenience: accept "123456" as a universal OTP until the
// real SMS provider is wired up. Production MUST set DEV_OTP="" to disable.
const DEV_OTP_CODE = process.env.DEV_OTP ?? "123456";

// ---- Phone lookup ------------------------------------------------------

/**
 * Step 1 of phone-based login. Given a phone number, return the list of
 * (role, fullName) pairs registered to that phone WITHIN the tenant. The
 * client uses this to decide whether to ask the user to pick a role.
 *
 * Returns an empty array if no user matches — the UI still presents the OTP
 * step (so attackers can't enumerate valid phones).
 */
export async function lookupPhone(input: z.infer<typeof PhoneLookupDto>) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: input.tenant_slug },
  });
  if (!tenant) {
    // Don't leak tenant existence to attackers — just return empty roles.
    return { roles: [] as Array<{ code: string; name: string }> };
  }
  const phone = normalizePhone(input.phone);
  const phoneHash = searchableHash(tenant.id, phone);

  const users = await prisma.user.findMany({
    where: {
      tenantId: tenant.id,
      phoneHash,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: { primaryRoleCode: true, fullName: true },
  });
  if (users.length === 0) return { roles: [] };
  // Pair each user with their role's display name.
  const roleCodes = Array.from(
    new Set(
      users
        .map((u) => u.primaryRoleCode)
        .filter((c): c is string => typeof c === "string"),
    ),
  );
  const roles = roleCodes.length
    ? await prisma.role.findMany({
        where: { tenantId: tenant.id, code: { in: roleCodes } },
      })
    : [];
  const nameByCode = new Map(roles.map((r) => [r.code, r.name]));
  return {
    roles: roleCodes.map((code) => ({
      code,
      name: nameByCode.get(code) ?? code,
    })),
  };
}

// ---- Phone + OTP login -------------------------------------------------

/**
 * Step 2 of phone-based login. Validates OTP and (when multiple users share
 * the same phone) picks the user with the requested `role_code`. Same return
 * shape as legacy email login so the rest of the client doesn't care which
 * door the user came in.
 */
export async function loginByPhone(
  input: z.infer<typeof PhoneLoginDto>,
  meta: { ip?: string; userAgent?: string } = {},
) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: input.tenant_slug },
  });
  if (!tenant) throw Unauthorized("Invalid credentials");

  // Dev-only OTP check (real implementation hits SMS provider + checks DB row).
  if (!DEV_OTP_CODE || input.otp !== DEV_OTP_CODE) {
    throw Unauthorized("Invalid OTP");
  }

  const phone = normalizePhone(input.phone);
  const phoneHash = searchableHash(tenant.id, phone);

  const candidates = await prisma.user.findMany({
    where: {
      tenantId: tenant.id,
      phoneHash,
      deletedAt: null,
      status: "ACTIVE",
    },
  });
  if (candidates.length === 0) throw Unauthorized("Invalid credentials");

  let user: (typeof candidates)[number] | undefined;
  if (candidates.length === 1) {
    user = candidates[0];
  } else {
    if (!input.role_code) {
      // The client should have called /auth/phone/lookup first.
      throw BadRequest("Multiple roles registered to this phone — pick one");
    }
    user = candidates.find((u) => u.primaryRoleCode === input.role_code);
    if (!user) throw Unauthorized("Invalid credentials");
  }
  if (!user) throw Unauthorized("Invalid credentials");

  return createSessionForUser(tenant, user, meta);
}

// ---- shared session creation ------------------------------------------

async function createSessionForUser(
  tenant: { id: string; slug: string; name: string },
  user: { id: string; fullName: string },
  meta: { ip?: string; userAgent?: string },
) {
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
  const branches = branchRows.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  const roles = userRoles.map((r) => r.role.code);
  if (branches.length === 0) {
    throw Unauthorized("User has no branch access — contact administrator");
  }

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
    user: { id: user.id, fullName: user.fullName },
    branches,
    roles,
  };
}

// ---- session lifecycle -------------------------------------------------

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
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
    },
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
