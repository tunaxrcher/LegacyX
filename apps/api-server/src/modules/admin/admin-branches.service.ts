import { z } from "zod";
import { prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import type { RequestContext } from "../../shared/context";

/**
 * Branch CRUD (Phase Q).
 *
 * Branches are tenant-level configuration — adding a new branch means
 * spinning up a new physical location with its own resources, schedules,
 * services, etc. ADMIN owns the lifecycle:
 *
 *   • Listing is gated on `user:read:tenant` (held by ADMIN + MANAGER) so a
 *     manager can see "what branches exist" — useful for the staff
 *     branch-assignment dialog.
 *   • Mutations require `branch:write:tenant` which is ADMIN-only.
 *
 * We do not (yet) support hard-delete — a branch with any historical data
 * (visits, invoices, etc.) is a permanent fixture for audit. Deactivation
 * is done by setting `status = INACTIVE`, which the UI hides from pickers
 * but keeps in the system for retrospective reporting.
 */

export const CreateBranchDto = z.object({
  code: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/, {
    message: "code must be alphanumeric / dash / underscore",
  }),
  name: z.string().min(1).max(120),
  address: z.string().max(500).optional().nullable(),
  timezone: z.string().min(1).max(64).default("Asia/Bangkok"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const UpdateBranchDto = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function listBranches(ctx: RequestContext) {
  // Gate on user:read so any role with admin-pages access can list branches
  // (needed for the staff-branch picker dialog as well).
  await authorize(ctx, { resource: "user", action: "read", target: {} });
  const branches = await prisma.branch.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
  return branches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    timezone: b.timezone,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));
}

export async function createBranch(
  ctx: RequestContext,
  input: z.infer<typeof CreateBranchDto>,
) {
  await authorize(ctx, { resource: "branch", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const collision = await prisma.branch.findFirst({
    where: { tenantId: ctx.tenantId, code: input.code },
  });
  if (collision) throw Conflict(`Branch code ${input.code} already exists`);

  const branch = await prisma.branch.create({
    data: {
      tenantId: ctx.tenantId,
      code: input.code,
      name: input.name,
      address: input.address ?? null,
      timezone: input.timezone,
      status: input.status,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "branch.create",
      resourceType: "Branch",
      resourceId: branch.id,
      correlationId: ctx.correlationId,
      after: {
        code: branch.code,
        name: branch.name,
        timezone: branch.timezone,
        status: branch.status,
      } as object,
    },
  });

  return { id: branch.id, code: branch.code };
}

export async function updateBranch(
  ctx: RequestContext,
  branchId: string,
  input: z.infer<typeof UpdateBranchDto>,
) {
  await authorize(ctx, { resource: "branch", action: "write", target: {} });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const existing = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!existing) throw NotFound(`Branch ${branchId} not found`);

  const before = {
    name: existing.name,
    address: existing.address,
    timezone: existing.timezone,
    status: existing.status,
  };

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: {
      name: input.name ?? undefined,
      address: input.address === undefined ? undefined : input.address,
      timezone: input.timezone ?? undefined,
      status: input.status ?? undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "branch.update",
      resourceType: "Branch",
      resourceId: branchId,
      correlationId: ctx.correlationId,
      before: before as object,
      after: {
        name: updated.name,
        address: updated.address,
        timezone: updated.timezone,
        status: updated.status,
      } as object,
    },
  });

  return { id: updated.id };
}
