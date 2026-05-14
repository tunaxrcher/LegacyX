/**
 * Phase M — Lab Orders & Results.
 *
 * Doctors ORDER labs against an open visit. Nurses (or an external LIS)
 * progress the order through COLLECTED → PROCESSING → RESULTED. A LabResult
 * is the immutable payload (numeric readings + optional PDF) attached when
 * the order resolves.
 *
 * Why we DON'T integrate a HL7 v2 / FHIR LIS in this phase:
 *   - The seed clinic ships with manual entry by the nurse (most aesthetic
 *     clinics in TH outsource labs to a courier service like NHL or AMS).
 *   - The event payloads (`lab.ordered`, `lab.resulted`) are stable so the
 *     LIS adapter can drop in later as a worker subscriber without touching
 *     this service.
 */

import { z } from "zod";
import { prisma } from "@legacyx/db";
import { LabEvents, EVENT_NAMES } from "@legacyx/events";
import type { RequestContext } from "../../shared/context";
import { authorize } from "../../shared/auth";
import { writeWithOutbox } from "../../shared/outbox";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";

export const CreateLabOrderDto = z.object({
  patient_id: z.string().min(1),
  visit_id: z.string().min(1),
  panel: z.string().min(1).max(40),
  notes: z.string().max(2000).optional(),
});

export async function createLabOrder(
  ctx: RequestContext,
  input: z.infer<typeof CreateLabOrderDto>,
) {
  await authorize(ctx, {
    resource: "lab",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId = ctx.actor.id;

  const visit = await prisma.visit.findFirst({
    where: { id: input.visit_id, tenantId: ctx.tenantId },
  });
  if (!visit) throw NotFound(`Visit ${input.visit_id} not found`);
  if (visit.patientId !== input.patient_id) {
    throw BadRequest("patient_id does not match visit.patientId");
  }
  if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    throw BadRequest(`Cannot order labs on ${visit.status} visit`);
  }

  return writeWithOutbox(ctx, async (tx) => {
    const order = await tx.labOrder.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId ?? visit.branchId,
        patientId: input.patient_id,
        visitId: input.visit_id,
        orderedBy: actorId,
        panel: input.panel,
        notes: input.notes,
        status: "ORDERED",
      },
    });
    return {
      result: order,
      events: [
        {
          eventName: EVENT_NAMES.LAB_ORDERED,
          payload: LabEvents.LabOrderedV1Payload.parse({
            lab_order_id: order.id,
            patient_id: order.patientId,
            visit_id: order.visitId,
            ordered_by: actorId,
            panel: order.panel,
            notes: order.notes ?? undefined,
          }),
        },
      ],
    };
  });
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ORDERED: ["COLLECTED", "CANCELLED"],
  COLLECTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["RESULTED", "CANCELLED"],
  RESULTED: [],
  CANCELLED: [],
};

export const UpdateLabStatusDto = z.object({
  status: z.enum(["COLLECTED", "PROCESSING", "CANCELLED"]),
});

export async function updateLabOrderStatus(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof UpdateLabStatusDto>,
) {
  // Collection is the nurse's job; cancellation can be the doctor's. We
  // require either lab:collect (nurse) or lab:write (doctor) — both map to
  // valid roles in seed.
  if (input.status === "COLLECTED" || input.status === "PROCESSING") {
    await authorize(ctx, {
      resource: "lab",
      action: "collect",
      target: { branchId: ctx.branchId },
    });
  } else {
    await authorize(ctx, {
      resource: "lab",
      action: "write",
      target: { branchId: ctx.branchId },
    });
  }
  const order = await prisma.labOrder.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!order) throw NotFound(`LabOrder ${id} not found`);
  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw Conflict(
      `Cannot transition lab order from ${order.status} → ${input.status}`,
    );
  }
  return prisma.labOrder.update({
    where: { id: order.id },
    data: { status: input.status },
  });
}

export const RecordLabResultDto = z.object({
  payload: z.record(z.unknown()),
  /// Optional S3 key of an attached PDF/CSV the lab provided.
  file_key: z.string().max(400).optional(),
  resulted_at: z.string().datetime({ offset: true }).optional(),
});

export async function recordLabResult(
  ctx: RequestContext,
  labOrderId: string,
  input: z.infer<typeof RecordLabResultDto>,
) {
  await authorize(ctx, {
    resource: "lab",
    action: "result",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId = ctx.actor.id;

  const order = await prisma.labOrder.findFirst({
    where: { id: labOrderId, tenantId: ctx.tenantId },
  });
  if (!order) throw NotFound(`LabOrder ${labOrderId} not found`);
  if (order.status === "CANCELLED") {
    throw BadRequest("Cannot record results on a cancelled order");
  }
  if (order.status === "RESULTED") {
    throw Conflict("Lab order already has a result — amend instead");
  }

  const resultedAt = input.resulted_at ? new Date(input.resulted_at) : new Date();

  return writeWithOutbox(ctx, async (tx) => {
    const result = await tx.labResult.create({
      data: {
        labOrderId: order.id,
        payload: input.payload as object,
        fileUrl: input.file_key ?? null,
        resultedAt,
        resultedBy: actorId,
      },
    });
    await tx.labOrder.update({
      where: { id: order.id },
      data: { status: "RESULTED" },
    });
    return {
      result: { result, order: { ...order, status: "RESULTED" as const } },
      events: [
        {
          eventName: EVENT_NAMES.LAB_RESULTED,
          payload: LabEvents.LabResultedV1Payload.parse({
            lab_order_id: order.id,
            lab_result_id: result.id,
            patient_id: order.patientId,
            panel: order.panel,
            resulted_by: actorId,
            resulted_at: resultedAt.toISOString(),
            payload: input.payload,
            file_key: input.file_key,
          }),
        },
      ],
    };
  });
}

export async function listLabOrders(
  ctx: RequestContext,
  filter: { visit_id?: string; patient_id?: string; status?: string },
) {
  await authorize(ctx, {
    resource: "lab",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  return prisma.labOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      visitId: filter.visit_id,
      patientId: filter.patient_id,
      status: filter.status as "ORDERED" | "COLLECTED" | "PROCESSING" | "RESULTED" | "CANCELLED" | undefined,
    },
    include: { results: { orderBy: { resultedAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLabOrder(ctx: RequestContext, id: string) {
  await authorize(ctx, {
    resource: "lab",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  const order = await prisma.labOrder.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { results: { orderBy: { resultedAt: "desc" } } },
  });
  if (!order) throw NotFound(`LabOrder ${id} not found`);
  return order;
}
