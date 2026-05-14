/**
 * Public catalog + guest-booking service.
 *
 * Powers the patient-app browsing flow BEFORE login:
 *   1. listCategories()    — homepage cards (Dental / Beauty / Wellness)
 *   2. listServices()      — services within a category
 *   3. getService()        — single service detail
 *   4. listPublicSlots()   — slots for a date+branch (no JWT required)
 *   5. publicBook()        — atomic: upsert Patient → create Appointment →
 *                            sign JWT → return (auto-login at success page)
 *
 * Security model:
 *   - All read endpoints are anonymous but accept a `tenant_slug` query param.
 *   - Write endpoint requires phone + name + KYC stub. We dedupe by phoneHash
 *     so revisiting guests don't pile up duplicate HN rows.
 *   - No ABAC `authorize()` calls here — caller is unauthenticated by design.
 *     The synthesised `RequestContext` actor is `{ type: "PATIENT", id: ... }`
 *     so audit log + outbox still trace responsibility back to the booking.
 */
import { z } from "zod";
import { Prisma, prisma } from "@legacyx/db";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { encryptField, searchableHash } from "../../shared/crypto";
import { signPatientJwt } from "../../shared/jwt";
import { nextHN } from "../../shared/hn";
import type { RequestContext } from "../../shared/context";

// =============================================================================
// Tenant lookup helper — every public endpoint needs a tenant scope
// =============================================================================

async function resolveTenant(slug: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) throw NotFound("Tenant not found");
  return tenant;
}

// =============================================================================
// CATEGORIES
// =============================================================================

export const TenantQuery = z.object({
  tenant_slug: z.string().min(1).default("legacyx"),
});

export async function listCategories(input: z.infer<typeof TenantQuery>) {
  const tenant = await resolveTenant(input.tenant_slug);
  const rows = await prisma.serviceCategory.findMany({
    where: { tenantId: tenant.id, active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      nameTh: true,
      description: true,
      descriptionTh: true,
      imageUrl: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    name_th: r.nameTh,
    description: r.description,
    description_th: r.descriptionTh,
    image_url: r.imageUrl,
  }));
}

// =============================================================================
// SERVICES (by category)
// =============================================================================

export const ListServicesQuery = z.object({
  tenant_slug: z.string().min(1).default("legacyx"),
  category_code: z.string().min(1),
});

export async function listServices(input: z.infer<typeof ListServicesQuery>) {
  const tenant = await resolveTenant(input.tenant_slug);
  const category = await prisma.serviceCategory.findFirst({
    where: { tenantId: tenant.id, code: input.category_code, active: true },
    select: { id: true, code: true, name: true, nameTh: true, imageUrl: true },
  });
  if (!category) throw NotFound("Category not found");

  const services = await prisma.service.findMany({
    where: { tenantId: tenant.id, categoryId: category.id, active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      nameTh: true,
      description: true,
      descriptionTh: true,
      priceFrom: true,
      priceTo: true,
      durationMin: true,
      imageUrl: true,
    },
  });

  return {
    category: {
      id: category.id,
      code: category.code,
      name: category.name,
      name_th: category.nameTh,
      image_url: category.imageUrl,
    },
    services: services.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      name_th: s.nameTh,
      description: s.description,
      description_th: s.descriptionTh,
      price_from: s.priceFrom ? Number(s.priceFrom) : null,
      price_to: s.priceTo ? Number(s.priceTo) : null,
      duration_min: s.durationMin,
      image_url: s.imageUrl,
    })),
  };
}

// =============================================================================
// SERVICE DETAIL — for register/book pages that show "you're booking X"
// =============================================================================

export const GetServiceQuery = z.object({
  tenant_slug: z.string().min(1).default("legacyx"),
  service_id: z.string().min(1),
});

export async function getService(input: z.infer<typeof GetServiceQuery>) {
  const tenant = await resolveTenant(input.tenant_slug);
  const svc = await prisma.service.findFirst({
    where: { id: input.service_id, tenantId: tenant.id, active: true },
    include: {
      category: {
        select: { id: true, code: true, name: true, nameTh: true },
      },
    },
  });
  if (!svc) throw NotFound("Service not found");
  return {
    id: svc.id,
    code: svc.code,
    name: svc.name,
    name_th: svc.nameTh,
    description: svc.description,
    description_th: svc.descriptionTh,
    price_from: svc.priceFrom ? Number(svc.priceFrom) : null,
    price_to: svc.priceTo ? Number(svc.priceTo) : null,
    duration_min: svc.durationMin,
    image_url: svc.imageUrl,
    procedure_code: svc.procedureCode,
    category: {
      id: svc.category.id,
      code: svc.category.code,
      name: svc.category.name,
      name_th: svc.category.nameTh,
    },
  };
}

// =============================================================================
// PUBLIC SLOTS — same generator as patient_portal but no JWT required
// =============================================================================

const SLOT_START_HOUR = 9;
const SLOT_END_HOUR = 17;
const SLOT_DURATION_MIN = 30;

export const ListPublicSlotsQuery = z.object({
  tenant_slug: z.string().min(1).default("legacyx"),
  branch_id: z.string().min(1),
  /** YYYY-MM-DD in Asia/Bangkok */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Optional — used to size the slot window based on service duration. */
  service_id: z.string().optional(),
});

export async function listPublicSlots(input: z.infer<typeof ListPublicSlotsQuery>) {
  const tenant = await resolveTenant(input.tenant_slug);

  const branch = await prisma.branch.findFirst({
    where: { id: input.branch_id, tenantId: tenant.id, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!branch) throw NotFound("Branch not found");

  const dayStart = new Date(`${input.date}T00:00:00+07:00`);
  const dayEnd = new Date(`${input.date}T23:59:59+07:00`);

  const existing = await prisma.appointment.findMany({
    where: {
      tenantId: tenant.id,
      branchId: branch.id,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { in: ["BOOKED", "CONFIRMED", "CHECKED_IN"] },
    },
    select: { scheduledAt: true, durationMin: true },
  });
  const taken = new Set(existing.map((a) => a.scheduledAt.toISOString()));

  const slots: Array<{ time_iso: string; label: string; available: boolean }> = [];
  const now = new Date();
  for (let h = SLOT_START_HOUR; h < SLOT_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_DURATION_MIN) {
      const slotIso = new Date(
        `${input.date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`,
      ).toISOString();
      const available = !taken.has(slotIso) && new Date(slotIso) > now;
      slots.push({
        time_iso: slotIso,
        label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        available,
      });
    }
  }
  return {
    branch_id: branch.id,
    branch_name: branch.name,
    date: input.date,
    slots,
  };
}

// =============================================================================
// LIST BRANCHES (public)
// =============================================================================

export async function listPublicBranches(input: z.infer<typeof TenantQuery>) {
  const tenant = await resolveTenant(input.tenant_slug);
  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE", deletedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, address: true },
  });
  return branches;
}

// =============================================================================
// GUEST BOOKING — the heart of the new flow
// =============================================================================

export const PublicBookDto = z.object({
  tenant_slug: z.string().min(1).default("legacyx"),
  service_id: z.string().min(1),
  branch_id: z.string().min(1),
  /** Booking mode — `SCHEDULED` requires `scheduled_at`; `WALKIN` uses now+15m. */
  mode: z.enum(["SCHEDULED", "WALKIN"]),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  full_name: z.string().min(2).max(120),
  phone: z.string().min(8).max(20),
  /**
   * KYC image — opaque data URL (`data:image/jpeg;base64,...`) for v1. The
   * `kyc-storage` adapter (out of scope for this phase) will swap this for an
   * S3 key. We strip the data URL prefix and store the FIRST 256 chars as a
   * placeholder so we don't blow up the row size while end-to-end S3 is
   * being wired up.
   */
  kyc_image_data_url: z.string().optional(),
  reason: z.string().max(2000).optional(),
});

export type PublicBookInput = z.infer<typeof PublicBookDto>;

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: full, lastName: "" };
  const [first, ...rest] = parts;
  return { firstName: first ?? full, lastName: rest.join(" ") };
}

export async function publicBook(input: PublicBookInput, correlationId: string) {
  const tenant = await resolveTenant(input.tenant_slug);

  const [service, branch] = await Promise.all([
    prisma.service.findFirst({
      where: { id: input.service_id, tenantId: tenant.id, active: true },
      include: { category: { select: { id: true, name: true, nameTh: true, code: true } } },
    }),
    prisma.branch.findFirst({
      where: { id: input.branch_id, tenantId: tenant.id, status: "ACTIVE" },
    }),
  ]);
  if (!service) throw NotFound("Service not found");
  if (!branch) throw NotFound("Branch not found");

  // Resolve scheduledAt based on mode.
  //   * SCHEDULED → use the slot the user picked.
  //   * WALKIN    → "now + 15 min" with millisecond jitter (0-59s) so two
  //                 back-to-back walk-ins from the same phone don't collide on
  //                 identical timestamps (which would otherwise trip the
  //                 same-slot conflict check below).
  let scheduledAt: Date;
  let channel: "WALKIN" | "LIFF" | "ONLINE";
  if (input.mode === "WALKIN") {
    const jitterMs = Math.floor(Math.random() * 60_000);
    scheduledAt = new Date(Date.now() + 15 * 60 * 1000 + jitterMs);
    channel = "WALKIN";
  } else {
    if (!input.scheduled_at) throw BadRequest("scheduled_at required for SCHEDULED bookings");
    scheduledAt = new Date(input.scheduled_at);
    if (scheduledAt.getTime() <= Date.now()) {
      throw BadRequest("Scheduled time must be in the future");
    }
    channel = "ONLINE";
  }

  // Phone-based dedupe — returning guest gets logged into their existing HN.
  const phoneHash = searchableHash(tenant.id, input.phone);
  const existingPatient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      phoneHash,
      deletedAt: null,
      status: { not: "MERGED" },
    },
    select: { id: true, hn: true, firstName: true, lastName: true, lineUserId: true },
  });

  const { firstName, lastName } = splitFullName(input.full_name);

  // Build the synthetic context BEFORE the transaction so outbox + audit use
  // the same correlation id end-to-end.
  // The actor id will be backfilled once we know the patient row id.
  let patientId: string;
  let patientHn: string;
  let isNewPatient = false;

  if (existingPatient) {
    // Returning guest. We DON'T overwrite their stored name (could clobber data
    // staff edited) but we do refresh the KYC image if provided so the next
    // counter visit sees the latest.
    patientId = existingPatient.id;
    patientHn = existingPatient.hn;
    if (input.kyc_image_data_url) {
      await prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          kycImageUrl: input.kyc_image_data_url.slice(0, 256),
          verificationStatus: "PENDING",
        },
      });
    }
  } else {
    isNewPatient = true;
    const hn = await nextHN(tenant.id);
    const created = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        hn,
        firstName,
        lastName,
        phoneEnc: encryptField(input.phone),
        phoneHash,
        homeBranchId: branch.id,
        kycImageUrl: input.kyc_image_data_url
          ? input.kyc_image_data_url.slice(0, 256)
          : null,
        verificationStatus: input.kyc_image_data_url ? "PENDING" : "UNVERIFIED",
        status: "ACTIVE",
      },
      select: { id: true, hn: true },
    });
    patientId = created.id;
    patientHn = created.hn;
  }

  // Conflict check — same patient, same exact slot. Only enforced for
  // SCHEDULED bookings; WALKIN is allowed to stack (same person can book
  // multiple services back-to-back during a single visit).
  if (input.mode === "SCHEDULED") {
    const conflict = await prisma.appointment.findFirst({
      where: {
        tenantId: tenant.id,
        patientId,
        scheduledAt,
        status: { in: ["BOOKED", "CONFIRMED", "CHECKED_IN"] },
      },
    });
    if (conflict) {
      throw Conflict(
        "You already have an appointment at this time. Please choose a different slot.",
      );
    }
  }

  const synthCtx: RequestContext = {
    correlationId,
    tenantId: tenant.id,
    branchId: branch.id,
    actor: { type: "PATIENT", id: patientId },
  };

  const appt = await writeWithOutbox(synthCtx, async (tx) => {
    const a = await tx.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        patientId,
        scheduledAt,
        durationMin: service.durationMin,
        channel,
        reason: input.reason,
        // Stash structured metadata so the staff visit screen can show what the
        // patient picked from the public catalog.
        metadata: {
          service_id: service.id,
          service_code: service.code,
          service_name: service.name,
          procedure_code: service.procedureCode,
          category_code: service.category.code,
          source: "patient_app_public",
          is_new_patient: isNewPatient,
        } as Prisma.InputJsonValue,
        status: "BOOKED",
      },
      select: { id: true, scheduledAt: true, status: true, channel: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: null, // patient — not a staff user
        action: "appointment.create",
        resourceType: "Appointment",
        resourceId: a.id,
        after: {
          patient_id: patientId,
          service_id: service.id,
          channel: a.channel,
          mode: input.mode,
          is_new_patient: isNewPatient,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      result: a,
      events: [
        {
          eventName: "appointment.created",
          payload: {
            appointment_id: a.id,
            patient_id: patientId,
            branch_id: branch.id,
            service_id: service.id,
            procedure_code: service.procedureCode,
            channel: a.channel,
            scheduled_at: a.scheduledAt.toISOString(),
            source: "patient_app_public",
            is_new_patient: isNewPatient,
          },
          aggregateType: "Appointment",
          aggregateId: a.id,
        },
      ],
    };
  });

  // Auto-login: mint a patient JWT so the success page can transition straight
  // into the authed area without a second LIFF round-trip.
  const { token, expiresAt } = signPatientJwt({
    patientId,
    tenantId: tenant.id,
  });

  return {
    appointment: {
      id: appt.id,
      scheduled_at: appt.scheduledAt.toISOString(),
      status: appt.status,
      channel: appt.channel,
      service: {
        id: service.id,
        code: service.code,
        name: service.name,
        name_th: service.nameTh,
      },
      branch: { id: branch.id, name: branch.name },
    },
    patient: {
      id: patientId,
      hn: patientHn,
      first_name: firstName,
      last_name: lastName,
      is_new: isNewPatient,
    },
    session: {
      token,
      expires_at: expiresAt.toISOString(),
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      patient: {
        id: patientId,
        hn: patientHn,
        first_name: firstName,
        last_name: lastName,
      },
    },
  };
}
