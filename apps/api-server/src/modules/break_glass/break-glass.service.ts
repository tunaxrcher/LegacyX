import { z } from "zod";
import { prisma } from "@legacyx/db";
import { BadRequest, NotFound } from "../../shared/errors";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export const CreateBreakGlassDto = z.object({
  actor_user_id: z.string().min(1), // junior staff who needs the override
  resource_type: z.string().min(1),
  resource_id: z.string().min(1),
  reason: z.string().min(10).max(1000),
  payload: z.record(z.unknown()).default({}),
});

export async function createBreakGlass(
  ctx: RequestContext,
  input: z.infer<typeof CreateBreakGlassDto>,
) {
  await authorize(ctx, {
    resource: "break_glass",
    action: "approve",
    target: {},
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const approverId: string = ctx.actor.id;
  if (approverId === input.actor_user_id) {
    throw BadRequest("Approver cannot be the same as actor");
  }

  const actor = await prisma.user.findFirst({
    where: { id: input.actor_user_id, tenantId: ctx.tenantId },
  });
  if (!actor) throw NotFound("Actor user not found");

  const row = await prisma.breakGlassOverride.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: input.actor_user_id,
      approvedBy: approverId,
      resourceType: input.resource_type,
      resourceId: input.resource_id,
      reason: input.reason,
      payload: input.payload as object,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: approverId,
      action: "break_glass.approve",
      resourceType: input.resource_type,
      resourceId: input.resource_id,
      reason: input.reason,
      correlationId: ctx.correlationId,
      after: { override_id: row.id, actor_user_id: input.actor_user_id } as object,
    },
  });

  return row;
}

export interface ListBreakGlassFilters {
  resourceType?: string;
  resourceId?: string;
  q?: string;
  /** 1-indexed page number. Caller is expected to clamp ≥ 1. */
  page: number;
  /** Items per page. Caller is expected to clamp + cap. */
  perPage: number;
}

export async function listBreakGlass(
  ctx: RequestContext,
  filters: ListBreakGlassFilters,
) {
  await authorize(ctx, { resource: "audit", action: "read", target: {} });
  const where: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.resourceId) where.resourceId = filters.resourceId;
  if (filters.q) {
    where.OR = [
      { resourceType: { contains: filters.q } },
      { resourceId: { contains: filters.q } },
      { reason: { contains: filters.q } },
    ];
  }
  const { page, perPage } = filters;
  const [total, rows] = await Promise.all([
    prisma.breakGlassOverride.count({ where }),
    prisma.breakGlassOverride.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);
  return { data: rows, pagination: { total, page, perPage } };
}
