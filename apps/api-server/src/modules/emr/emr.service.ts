import { z } from "zod";
import { prisma } from "@legacyx/db";
import { EVENT_NAMES, EmrEvents } from "@legacyx/events";
import { authorize } from "../../shared/auth";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { contentHash, encryptField, decryptField } from "../../shared/crypto";
import type { RequestContext } from "../../shared/context";

/** Fetch the EMR (current version + content) for a visit. Null if none yet. */
export async function getEmrByVisit(ctx: RequestContext, visitId: string) {
  await authorize(ctx, {
    resource: "emr",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  const emr = await prisma.eMR.findUnique({ where: { visitId } });
  if (!emr) return null;
  if (emr.tenantId !== ctx.tenantId) throw NotFound("EMR not found");
  const version = await prisma.eMRVersion.findFirst({
    where: { emrId: emr.id, version: emr.currentVersion },
  });
  let content: Record<string, unknown> = {};
  if (version) {
    try {
      content = JSON.parse(decryptField(version.contentEnc)) as Record<string, unknown>;
    } catch {
      content = {};
    }
  }
  return {
    id: emr.id,
    visitId: emr.visitId,
    patientId: emr.patientId,
    status: emr.status,
    currentVersion: emr.currentVersion,
    signedAt: version?.signedAt ?? null,
    signedBy: version?.signedBy ?? null,
    contentHash: version?.contentHash ?? null,
    content,
  };
}

// Open-ended JSON content; specific clinical schemas can be layered on top.
const EmrContent = z.record(z.unknown());

export const SignEmrDto = z.object({
  visit_id: z.string().min(1),
  patient_id: z.string().min(1),
  content: EmrContent,
  accepted_draft_id: z.string().optional(),
  amendment_of: z.number().int().positive().optional(),
  reason: z.string().max(2000).optional(), // required only for amendments
});
export type SignEmrInput = z.infer<typeof SignEmrDto>;

/**
 * Sign an EMR. Two cases:
 *   1. First time (no EMR row for this visit yet) → create EMR + version 1.
 *   2. Amendment (amendment_of provided + EMR exists) → new version N+1, status='AMENDED'.
 *
 * In both cases EMRVersion rows are immutable; only EMR.currentVersion is updated.
 */
export async function signEmr(ctx: RequestContext, input: SignEmrInput) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  if (!ctx.actor.id) throw BadRequest("Authenticated user required to sign EMR");
  const actorId: string = ctx.actor.id;
  const branchId: string = ctx.branchId;

  await authorize(ctx, {
    resource: "emr",
    action: "sign",
    target: { ownerUserId: actorId, branchId },
  });

  if (input.amendment_of && !input.reason) {
    throw BadRequest("Amendments require a 'reason'");
  }

  return writeWithOutbox(ctx, async (tx) => {
    // 1) Validate visit + patient
    const visit = await tx.visit.findFirst({
      where: { id: input.visit_id, tenantId: ctx.tenantId },
      select: { id: true, patientId: true, branchId: true, status: true },
    });
    if (!visit) throw NotFound("Visit not found");
    if (visit.patientId !== input.patient_id) {
      throw BadRequest("Patient does not match visit");
    }
    if (visit.branchId !== ctx.branchId) {
      throw BadRequest("Visit belongs to a different branch");
    }

    // Auto-bump visit to IN_PROGRESS on first clinical action (mirror of
    // createOrder) so doctors don't need to click "Send to exam room" first.
    if (visit.status === "OPEN") {
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    // 2) Find or create EMR header
    let emr = await tx.eMR.findUnique({ where: { visitId: input.visit_id } });

    if (!emr) {
      if (input.amendment_of) throw Conflict("Cannot amend: no existing EMR for this visit");
      emr = await tx.eMR.create({
        data: {
          tenantId: ctx.tenantId,
          branchId,
          patientId: input.patient_id,
          visitId: input.visit_id,
          currentVersion: 1,
          status: "DRAFT",
        },
      });
    }

    const nextVersion = input.amendment_of ? emr.currentVersion + 1 : emr.currentVersion;
    if (input.amendment_of && input.amendment_of !== emr.currentVersion) {
      throw Conflict(
        `amendment_of must reference current version (${emr.currentVersion})`,
      );
    }

    // 3) Build immutable version
    const hash = contentHash(input.content);
    const encrypted = encryptField(JSON.stringify(input.content));
    const signedAt = new Date();

    const version = await tx.eMRVersion.create({
      data: {
        emrId: emr.id,
        version: nextVersion,
        contentEnc: encrypted,
        contentHash: hash,
        signedBy: actorId,
        signedAt,
        amendmentOf: input.amendment_of ?? null,
      },
    });

    // 4) Lock EMR (status SIGNED or AMENDED)
    const updatedEmr = await tx.eMR.update({
      where: { id: emr.id },
      data: {
        currentVersion: nextVersion,
        status: input.amendment_of ? "AMENDED" : "SIGNED",
      },
    });

    // 5) Mark linked AIDraft as APPROVED (consume-on-sign UX) — optional
    if (input.accepted_draft_id) {
      await tx.aIDraft.update({
        where: { id: input.accepted_draft_id },
        data: { status: "EDITED" },
      });
      await tx.aIApprovalLog.create({
        data: {
          draftId: input.accepted_draft_id,
          reviewedBy: actorId,
          action: "EDIT_AND_APPROVE",
          notes: "Approved during EMR sign",
        },
      });
    }

    // 6) AuditLog
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId,
        actorUserId: actorId,
        action: input.amendment_of ? "emr.amended" : "emr.signed",
        resourceType: "EMR",
        resourceId: emr.id,
        after: { version: nextVersion, contentHash: hash },
        correlationId: ctx.correlationId,
      },
    });

    // 7) Outbox event
    const events = input.amendment_of
      ? [
          {
            eventName: EVENT_NAMES.EMR_AMENDED,
            payload: EmrEvents.EmrAmendedV1Payload.parse({
              emr_id: emr.id,
              new_version: nextVersion,
              amendment_of: input.amendment_of,
              amended_by: actorId,
              reason: input.reason!,
            }),
          },
        ]
      : [
          {
            eventName: EVENT_NAMES.EMR_SIGNED,
            payload: EmrEvents.EmrSignedV1Payload.parse({
              emr_id: emr.id,
              version: nextVersion,
              patient_id: emr.patientId,
              signed_by: actorId,
              signed_at: signedAt.toISOString(),
              content_hash: hash,
            }),
          },
        ];

    return {
      result: {
        emr: updatedEmr,
        version: {
          id: version.id,
          version: version.version,
          contentHash: hash,
          signedAt,
        },
      },
      events,
    };
  });
}
