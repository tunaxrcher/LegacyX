import { z } from "zod";
import { Prisma, prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import type { RequestContext } from "../../shared/context";

export const ApprovalDto = z.object({
  action: z.enum(["APPROVE", "REJECT", "EDIT_AND_APPROVE"]),
  diff: z.record(z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
});
export type ApprovalInput = z.infer<typeof ApprovalDto>;

/**
 * Decide on an AI draft (assistive only — final clinical decisions still require
 * a real physician). Records AIApprovalLog and updates AIDraft.status.
 */
export async function decideOnDraft(
  ctx: RequestContext,
  draftId: string,
  input: ApprovalInput,
) {
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const reviewerId = ctx.actor.id;

  await authorize(ctx, { resource: "emr", action: "write" });

  return prisma.$transaction(async (tx) => {
    const draft = await tx.aIDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.tenantId !== ctx.tenantId) throw NotFound("Draft not found");
    if (draft.status !== "PENDING") {
      throw Conflict(`Draft already ${draft.status}`);
    }

    const newStatus =
      input.action === "REJECT"
        ? "REJECTED"
        : input.action === "EDIT_AND_APPROVE"
        ? "EDITED"
        : "APPROVED";

    const [updated, log] = await Promise.all([
      tx.aIDraft.update({ where: { id: draftId }, data: { status: newStatus } }),
      tx.aIApprovalLog.create({
        data: {
          draftId,
          reviewedBy: reviewerId,
          action: input.action,
          diff: input.diff as Prisma.InputJsonValue | undefined,
          notes: input.notes,
        },
      }),
      tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          actorUserId: reviewerId,
          action: `ai.draft.${input.action.toLowerCase()}`,
          resourceType: "AIDraft",
          resourceId: draftId,
          after: { status: newStatus },
          correlationId: ctx.correlationId,
        },
      }),
    ]);

    return { draft: updated, approvalLog: log };
  });
}
