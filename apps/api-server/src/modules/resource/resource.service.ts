import { z } from "zod";
import { prisma } from "@legacyx/db";
import { EVENT_NAMES } from "@legacyx/events";
import {
  BadRequest,
  Conflict,
  NotFound,
} from "../../shared/errors";
import { authorize } from "../../shared/auth";
import { writeWithOutbox } from "../../shared/outbox";
import type { RequestContext } from "../../shared/context";

const ResourceTypeEnum = z.enum(["ROOM", "MACHINE", "THERAPIST", "LASER", "OTHER"]);
const ResourceStatusEnum = z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE", "RETIRED"]);

export const CreateResourceDto = z.object({
  type: ResourceTypeEnum,
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  capacity: z.number().int().min(1).default(1),
  floor: z.number().int().optional(),
  subtype: z.string().max(40).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const UpdateResourceDto = z.object({
  name: z.string().min(1).max(120).optional(),
  capacity: z.number().int().min(1).optional(),
  floor: z.number().int().optional(),
  subtype: z.string().max(40).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const SetStatusDto = z.object({
  status: ResourceStatusEnum,
  reason: z.string().max(500).optional(),
});

export const MaintenanceDto = z.object({
  reason: z.string().min(3).max(500),
  endsAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

export const ReleaseDto = z.object({
  reason: z.string().max(500).optional(),
});

// ---------- Helpers ----------

function mergeAttributes(
  existing: unknown,
  patch: { floor?: number; subtype?: string; extra?: Record<string, unknown> },
): Record<string, unknown> {
  const base = (existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {});
  const next: Record<string, unknown> = { ...base, ...(patch.extra ?? {}) };
  if (patch.floor !== undefined) next.floor = patch.floor;
  if (patch.subtype !== undefined) next.subtype = patch.subtype;
  return next;
}

// ---------- Queries ----------

/**
 * List resources (optionally filtered by type) for the active branch,
 * each enriched with its currently active reservation (HELD/CONFIRMED that
 * overlaps "now") so the UI can render occupant info + release button.
 */
export async function listResourcesWithStatus(
  ctx: RequestContext,
  filters: { type?: string; includeRetired?: boolean } = {},
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "read",
    target: { branchId: ctx.branchId },
  });

  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    deletedAt: null,
  };
  if (filters.type) where.type = filters.type;
  if (!filters.includeRetired) where.status = { not: "RETIRED" };

  const resources = await prisma.resource.findMany({
    where,
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  const now = new Date();
  const activeReservations = await prisma.resourceReservation.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      resourceId: { in: resources.map((r) => r.id) },
      status: { in: ["HELD", "CONFIRMED"] },
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "desc" },
  });

  // Resolve patient names from appointments → patients
  const apptIds = Array.from(
    new Set(
      activeReservations
        .map((r) => r.appointmentId)
        .filter((x): x is string => !!x),
    ),
  );
  const appts = apptIds.length
    ? await prisma.appointment.findMany({
        where: { id: { in: apptIds } },
        select: {
          id: true,
          doctorId: true,
          patient: { select: { firstName: true, lastName: true, hn: true } },
        },
      })
    : [];
  const apptMap = new Map(appts.map((a) => [a.id, a]));

  // Resolve doctor names + visit ids for appointment ids in one batch
  const doctorIds = Array.from(
    new Set(appts.map((a) => a.doctorId).filter((x): x is string => !!x)),
  );
  const doctors = doctorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: doctorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const doctorMap = new Map(doctors.map((d) => [d.id, d.fullName]));

  const visits = apptIds.length
    ? await prisma.visit.findMany({
        where: {
          tenantId: ctx.tenantId,
          appointmentId: { in: apptIds },
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        select: { id: true, appointmentId: true, status: true },
      })
    : [];
  const visitByAppt = new Map(visits.map((v) => [v.appointmentId!, v]));

  const reservationByResource = new Map(
    activeReservations.map((r) => [r.resourceId, r]),
  );

  return resources.map((r) => {
    const reservation = reservationByResource.get(r.id) ?? null;
    const appt = reservation?.appointmentId
      ? apptMap.get(reservation.appointmentId)
      : null;
    const occupant = appt?.patient
      ? {
          name: `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
          hn: appt.patient.hn,
        }
      : null;
    const doctor = appt?.doctorId
      ? { id: appt.doctorId, name: doctorMap.get(appt.doctorId) ?? null }
      : null;
    const visit = appt?.id ? visitByAppt.get(appt.id) ?? null : null;
    // Effective status: if occupied by an active reservation, prefer OCCUPIED
    const effectiveStatus =
      r.status === "AVAILABLE" && reservation ? "OCCUPIED" : r.status;
    return {
      id: r.id,
      type: r.type,
      code: r.code,
      name: r.name,
      capacity: r.capacity,
      status: effectiveStatus,
      rawStatus: r.status,
      attributes: r.attributes ?? null,
      activeReservation: reservation
        ? {
            id: reservation.id,
            startsAt: reservation.startsAt.toISOString(),
            endsAt: reservation.endsAt.toISOString(),
            status: reservation.status,
            appointmentId: reservation.appointmentId,
            occupant,
            doctor,
            visit: visit ? { id: visit.id, status: visit.status } : null,
          }
        : null,
    };
  });
}

// ---------- Commands ----------

export async function createResource(
  ctx: RequestContext,
  input: z.infer<typeof CreateResourceDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const existing = await tx.resource.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        code: input.code,
      },
    });
    if (existing) throw Conflict(`Resource code ${input.code} already exists in this branch`);

    const attrs = mergeAttributes(input.attributes ?? {}, {
      floor: input.floor,
      subtype: input.subtype,
    });
    const r = await tx.resource.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        type: input.type,
        code: input.code,
        name: input.name,
        capacity: input.capacity,
        status: "AVAILABLE",
        attributes: attrs as object,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? undefined,
        action: "resource.create",
        resourceType: "Resource",
        resourceId: r.id,
        correlationId: ctx.correlationId,
        after: { code: r.code, type: r.type, name: r.name } as object,
      },
    });
    return {
      result: r,
      events: [
        {
          eventName: EVENT_NAMES.RESOURCE_CREATED,
          payload: { resource_id: r.id, type: r.type, code: r.code },
        },
      ],
    };
  });
}

export async function updateResource(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof UpdateResourceDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const existing = await tx.resource.findFirst({
      where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId!, deletedAt: null },
    });
    if (!existing) throw NotFound(`Resource ${id} not found`);
    const attrs =
      input.floor !== undefined ||
      input.subtype !== undefined ||
      input.attributes !== undefined
        ? mergeAttributes(existing.attributes, {
            floor: input.floor,
            subtype: input.subtype,
            extra: input.attributes,
          })
        : undefined;
    const r = await tx.resource.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        capacity: input.capacity ?? undefined,
        attributes: attrs !== undefined ? (attrs as object) : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? undefined,
        action: "resource.update",
        resourceType: "Resource",
        resourceId: r.id,
        correlationId: ctx.correlationId,
        before: { name: existing.name, attributes: existing.attributes } as object,
        after: { name: r.name, attributes: r.attributes } as object,
      },
    });
    return {
      result: r,
      events: [
        {
          eventName: EVENT_NAMES.RESOURCE_UPDATED,
          payload: { resource_id: r.id },
        },
      ],
    };
  });
}

/**
 * Release the active reservation for a resource (manual override).
 * Used when staff forget to checkout but the patient has left.
 */
export async function releaseResource(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof ReleaseDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "release",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const r = await tx.resource.findFirst({
      where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId!, deletedAt: null },
    });
    if (!r) throw NotFound(`Resource ${id} not found`);

    const now = new Date();
    const active = await tx.resourceReservation.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        resourceId: id,
        status: { in: ["HELD", "CONFIRMED"] },
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
    });
    if (active.length === 0) {
      throw Conflict("No active reservation to release");
    }
    await tx.resourceReservation.updateMany({
      where: { id: { in: active.map((a) => a.id) } },
      data: { status: "RELEASED", endsAt: now },
    });
    // Set resource status back to AVAILABLE if it was OCCUPIED
    if (r.status === "OCCUPIED") {
      await tx.resource.update({
        where: { id },
        data: { status: "AVAILABLE" },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? undefined,
        action: "resource.release",
        resourceType: "Resource",
        resourceId: r.id,
        reason: input.reason,
        correlationId: ctx.correlationId,
        after: { reservation_ids: active.map((a) => a.id) } as object,
      },
    });
    return {
      result: { released: active.length },
      events: [
        {
          eventName: EVENT_NAMES.RESOURCE_RELEASED,
          payload: {
            resource_id: r.id,
            reservation_ids: active.map((a) => a.id),
            reason: input.reason ?? null,
          },
        },
      ],
    };
  });
}

export async function setMaintenance(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof MaintenanceDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "maintain",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const r = await tx.resource.findFirst({
      where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId!, deletedAt: null },
    });
    if (!r) throw NotFound(`Resource ${id} not found`);

    const m = await tx.resourceMaintenance.create({
      data: {
        resourceId: r.id,
        reason: input.reason,
        startsAt: new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        performedBy: ctx.actor.id ?? null,
        notes: input.notes,
      },
    });
    await tx.resource.update({
      where: { id: r.id },
      data: { status: "MAINTENANCE" },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? undefined,
        action: "resource.maintenance_start",
        resourceType: "Resource",
        resourceId: r.id,
        reason: input.reason,
        correlationId: ctx.correlationId,
        after: { maintenance_id: m.id } as object,
      },
    });
    return {
      result: m,
      events: [
        {
          eventName: EVENT_NAMES.RESOURCE_MAINTENANCE_STARTED,
          payload: {
            resource_id: r.id,
            maintenance_id: m.id,
            reason: input.reason,
          },
        },
      ],
    };
  });
}

export async function endMaintenance(ctx: RequestContext, id: string) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "maintain",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const r = await tx.resource.findFirst({
      where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId!, deletedAt: null },
    });
    if (!r) throw NotFound(`Resource ${id} not found`);
    if (r.status !== "MAINTENANCE") {
      throw Conflict("Resource is not in maintenance");
    }
    const open = await tx.resourceMaintenance.findMany({
      where: { resourceId: r.id, endsAt: null },
    });
    const now = new Date();
    if (open.length) {
      await tx.resourceMaintenance.updateMany({
        where: { id: { in: open.map((o) => o.id) } },
        data: { endsAt: now },
      });
    }
    await tx.resource.update({
      where: { id: r.id },
      data: { status: "AVAILABLE" },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? undefined,
        action: "resource.maintenance_end",
        resourceType: "Resource",
        resourceId: r.id,
        correlationId: ctx.correlationId,
      },
    });
    return {
      result: { ok: true },
      events: [
        {
          eventName: EVENT_NAMES.RESOURCE_MAINTENANCE_ENDED,
          payload: { resource_id: r.id },
        },
      ],
    };
  });
}

/**
 * Soft-delete a resource (sets deletedAt + status=RETIRED). Refuses if there
 * are any active reservations to avoid orphaning current visits.
 */
export async function deleteResource(ctx: RequestContext, id: string) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "resource",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const r = await tx.resource.findFirst({
      where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId!, deletedAt: null },
    });
    if (!r) throw NotFound(`Resource ${id} not found`);

    const now = new Date();
    const active = await tx.resourceReservation.count({
      where: {
        resourceId: id,
        status: { in: ["HELD", "CONFIRMED"] },
        endsAt: { gte: now },
      },
    });
    if (active > 0) {
      throw Conflict(
        `Cannot delete — ${active} active reservation(s). Release them first.`,
      );
    }

    await tx.resource.update({
      where: { id },
      data: { deletedAt: now, status: "RETIRED" },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id ?? undefined,
        action: "resource.delete",
        resourceType: "Resource",
        resourceId: r.id,
        correlationId: ctx.correlationId,
        before: { code: r.code, name: r.name, status: r.status } as object,
      },
    });
    return {
      result: { ok: true },
      events: [
        {
          eventName: EVENT_NAMES.RESOURCE_UPDATED,
          payload: { resource_id: r.id, deleted: true },
        },
      ],
    };
  });
}

/**
 * Helper for other modules (e.g. visit.complete) to release any active
 * reservations a visit/appointment had — silent if there are none.
 * Must be called inside a transaction.
 */
export async function autoReleaseForAppointment(
  tx: Parameters<Parameters<typeof writeWithOutbox>[1]>[0],
  appointmentId: string,
): Promise<{ resourceIds: string[] }> {
  const now = new Date();
  const active = await tx.resourceReservation.findMany({
    where: {
      appointmentId,
      status: { in: ["HELD", "CONFIRMED"] },
    },
  });
  if (active.length === 0) return { resourceIds: [] };
  await tx.resourceReservation.updateMany({
    where: { id: { in: active.map((a) => a.id) } },
    data: { status: "CONSUMED", endsAt: now },
  });
  const resourceIds = Array.from(new Set(active.map((a) => a.resourceId)));
  await tx.resource.updateMany({
    where: { id: { in: resourceIds }, status: "OCCUPIED" },
    data: { status: "AVAILABLE" },
  });
  return { resourceIds };
}
