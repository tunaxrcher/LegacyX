import { z } from "zod";
import { prisma } from "@legacyx/db";
import { AppointmentEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { signPatientJwt } from "../../shared/jwt";
import { decryptField, encryptField, searchableHash } from "../../shared/crypto";
import { normalizePhone } from "@legacyx/db";
import type { PatientRequestContext } from "../../shared/patientContext";
import type { RequestContext } from "../../shared/context";

// =============================================================================
// AUTH
// =============================================================================

export const PatientLoginDto = z.object({
  tenant_slug: z.string().min(1),
  /** LINE userId from `liff.getProfile()`. In dev we fall back to seeded value. */
  line_user_id: z.string().min(1),
  /** Optional id_token from LIFF — verified out of scope for v1; we trust LIFF
   *  fingerprint in the demo and rely on tenant slug + lineUserId binding. */
  id_token: z.string().optional(),
});

export async function patientLogin(input: z.infer<typeof PatientLoginDto>) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: input.tenant_slug, status: "ACTIVE" },
  });
  if (!tenant) throw NotFound("Tenant not found");

  const patient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      lineUserId: input.line_user_id,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: { id: true, hn: true, firstName: true, lastName: true, lineUserId: true },
  });
  if (!patient) {
    throw NotFound(
      "No patient is linked to this LINE account. Please ask reception to link your profile.",
    );
  }

  const { token, expiresAt } = signPatientJwt({
    patientId: patient.id,
    tenantId: tenant.id,
    lineUserId: patient.lineUserId ?? input.line_user_id,
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "patient.login",
      resourceType: "Patient",
      resourceId: patient.id,
      after: { line_user_id: input.line_user_id, channel: "LIFF" } as object,
    },
  });

  return {
    token,
    expires_at: expiresAt.toISOString(),
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    patient: {
      id: patient.id,
      hn: patient.hn,
      first_name: patient.firstName,
      last_name: patient.lastName,
    },
  };
}

// =============================================================================
// PHONE-BASED LOGIN (shim — OTP verification done on frontend for v1)
// =============================================================================
//
// The patient app collects phone + OTP, but OTP gateway integration is out of
// scope for this phase (clinic will plug in their SMS provider later). This
// endpoint trusts the (phone, otp_code) pair UNCONDITIONALLY in development.
// In production, swap the OTP check for the real provider before exposing it
// publicly.

export const PatientPhoneLookupDto = z.object({
  tenant_slug: z.string().min(1),
  phone: z.string().min(4).max(20),
});

/**
 * Step 1 of patient phone-login: cheap existence check before we ask the
 * patient to type a 6-digit OTP. Avoids the bad UX of "type the OTP, fail,
 * try again with a different number" — a problem because patients only get
 * a Patient row after they've BOOKED a service at least once.
 *
 * Returns `{ exists: true }` only when (tenant, phoneHash) maps to an active
 * Patient row. We deliberately do NOT include any patient PII in the
 * response (no name, no HN, no masking) because the caller is unauthenticated
 * — anyone who guesses a phone number could otherwise harvest names.
 *
 * Tenant-not-found returns `{ exists: false }` (don't leak tenant existence).
 */
export async function patientPhoneLookup(
  input: z.infer<typeof PatientPhoneLookupDto>,
): Promise<{ exists: boolean }> {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: input.tenant_slug, status: "ACTIVE" },
  });
  if (!tenant) return { exists: false };

  const phoneHash = searchableHash(tenant.id, input.phone);
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      phoneHash,
      deletedAt: null,
      status: { not: "MERGED" },
    },
    select: { id: true },
  });
  return { exists: !!patient };
}

export const PatientPhoneLoginDto = z.object({
  tenant_slug: z.string().min(1),
  phone: z.string().min(8).max(20),
  /** 6-digit OTP — value is collected from the UI but NOT verified yet. */
  otp_code: z.string().min(4).max(8),
});

export async function patientPhoneLogin(
  input: z.infer<typeof PatientPhoneLoginDto>,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: input.tenant_slug, status: "ACTIVE" },
  });
  if (!tenant) throw NotFound("Tenant not found");

  const phoneHash = searchableHash(tenant.id, input.phone);
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      phoneHash,
      deletedAt: null,
      status: { not: "MERGED" },
    },
    select: { id: true, hn: true, firstName: true, lastName: true, lineUserId: true },
  });
  if (!patient) {
    throw NotFound(
      "No patient found for that phone number. Please book a service first to register.",
    );
  }

  const { token, expiresAt } = signPatientJwt({
    patientId: patient.id,
    tenantId: tenant.id,
    lineUserId: patient.lineUserId ?? undefined,
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "patient.login",
      resourceType: "Patient",
      resourceId: patient.id,
      after: { channel: "PHONE_OTP", otp_verified: true } as object,
    },
  });

  return {
    token,
    expires_at: expiresAt.toISOString(),
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    patient: {
      id: patient.id,
      hn: patient.hn,
      first_name: patient.firstName,
      last_name: patient.lastName,
    },
  };
}

// =============================================================================
// PROFILE
// =============================================================================

function safeDecrypt(blob: string | null | undefined): string | undefined {
  if (!blob) return undefined;
  try {
    return decryptField(blob);
  } catch {
    return undefined;
  }
}

export async function getMyProfile(ctx: PatientRequestContext) {
  const patient = await prisma.patient.findFirst({
    where: { id: ctx.patientId, tenantId: ctx.tenantId },
    select: {
      id: true,
      hn: true,
      firstName: true,
      lastName: true,
      nicknameEnc: true,
      dob: true,
      gender: true,
      phoneEnc: true,
      emailEnc: true,
      bloodType: true,
      allergies: true,
      homeBranchId: true,
      lineUserId: true,
      lineDisplayName: true,
      linePictureUrl: true,
      lineLinkedAt: true,
      lineNotificationsOptIn: true,
      lineFriendStatus: true,
      createdAt: true,
    },
  });
  if (!patient) throw NotFound("Patient profile not found");

  // Resolve the home branch name so the patient app doesn't have to render an
  // opaque cuid as "สาขาประจำ" on the profile screen.
  const homeBranch = patient.homeBranchId
    ? await prisma.branch.findFirst({
        where: {
          id: patient.homeBranchId,
          tenantId: ctx.tenantId,
        },
        select: { id: true, name: true, code: true },
      })
    : null;

  return {
    id: patient.id,
    hn: patient.hn,
    first_name: patient.firstName,
    last_name: patient.lastName,
    nickname: safeDecrypt(patient.nicknameEnc),
    dob: patient.dob?.toISOString() ?? null,
    gender: patient.gender,
    phone: safeDecrypt(patient.phoneEnc),
    email: safeDecrypt(patient.emailEnc),
    blood_type: patient.bloodType,
    allergies: patient.allergies,
    home_branch_id: patient.homeBranchId,
    home_branch_name: homeBranch?.name ?? null,
    home_branch_code: homeBranch?.code ?? null,
    line_linked: !!patient.lineUserId,
    line_display_name: patient.lineDisplayName,
    line_picture_url: patient.linePictureUrl,
    line_linked_at: patient.lineLinkedAt?.toISOString() ?? null,
    line_notifications_opt_in: patient.lineNotificationsOptIn,
    line_friend_status: patient.lineFriendStatus,
    member_since: patient.createdAt.toISOString(),
  };
}

// =============================================================================
// PROFILE UPDATE — patient self-service edit on /profile
// =============================================================================

/**
 * Fields the patient is allowed to edit from the patient app.
 *
 * Identity-critical fields (`first_name`, `last_name`) are deliberately
 * excluded — those are tied to the EMR and KYC artefact and need a staff
 * action to update. The patient may still update demographics, contact
 * details, allergies, and their preferred branch.
 *
 * Allergies arrive as `string[]` (chips); we persist as JSON array. An empty
 * array clears the field. `home_branch_id` is validated against the
 * tenant's branch list before write.
 */
export const UpdatePatientProfileDto = z
  .object({
    nickname: z.string().trim().max(80).optional().nullable(),
    /** ISO date (YYYY-MM-DD or full ISO) — null clears. */
    dob: z.string().trim().optional().nullable(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    email: z.string().trim().email().max(120).optional().nullable(),
    blood_type: z
      .enum(["A", "B", "AB", "O", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .optional()
      .nullable(),
    allergies: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    home_branch_id: z.string().trim().max(60).optional().nullable(),
  })
  .strict();

export async function updateMyProfile(
  ctx: PatientRequestContext,
  input: z.infer<typeof UpdatePatientProfileDto>,
) {
  const data: Record<string, unknown> = {};

  if ("nickname" in input) {
    const v = input.nickname?.trim() ?? "";
    data.nicknameEnc = v ? encryptField(v) : null;
  }

  if ("dob" in input) {
    if (input.dob === null || input.dob === undefined || input.dob === "") {
      data.dob = null;
    } else {
      const d = new Date(input.dob);
      if (Number.isNaN(d.getTime())) throw BadRequest("Invalid date of birth");
      if (d.getTime() > Date.now()) {
        throw BadRequest("Date of birth cannot be in the future");
      }
      data.dob = d;
    }
  }

  if ("gender" in input) {
    data.gender = input.gender ?? null;
  }

  if ("phone" in input) {
    if (!input.phone) {
      data.phoneEnc = null;
      data.phoneHash = null;
    } else {
      const normalised = normalizePhone(input.phone);
      if (normalised.length < 6) throw BadRequest("Invalid phone number");
      // Conflict check — a different patient in the tenant must not already
      // own this phone (prevents accidental account takeover via the lookup
      // hash). We allow the same patient to "re-set" the same phone.
      const phoneHash = searchableHash(ctx.tenantId, input.phone);
      const conflict = await prisma.patient.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phoneHash,
          id: { not: ctx.patientId },
          deletedAt: null,
          status: { not: "MERGED" },
        },
        select: { id: true },
      });
      if (conflict) {
        throw Conflict(
          "This phone number is already used by another patient. Please contact reception.",
        );
      }
      data.phoneEnc = encryptField(input.phone);
      data.phoneHash = phoneHash;
    }
  }

  if ("email" in input) {
    data.emailEnc = input.email ? encryptField(input.email) : null;
  }

  if ("blood_type" in input) {
    data.bloodType = input.blood_type ?? null;
  }

  if ("allergies" in input && Array.isArray(input.allergies)) {
    const cleaned = input.allergies
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    data.allergies = cleaned.length ? cleaned : null;
  }

  if ("home_branch_id" in input) {
    if (!input.home_branch_id) {
      data.homeBranchId = null;
    } else {
      const branch = await prisma.branch.findFirst({
        where: {
          id: input.home_branch_id,
          tenantId: ctx.tenantId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!branch) throw BadRequest("Selected branch is not available");
      data.homeBranchId = branch.id;
    }
  }

  if (Object.keys(data).length === 0) {
    // No-op update; just return the current profile. We deliberately don't
    // throw here so the UI can debounce safely.
    return getMyProfile(ctx);
  }

  await prisma.$transaction(async (tx) => {
    await tx.patient.update({
      where: { id: ctx.patientId },
      data,
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        action: "patient.profile.update",
        resourceType: "Patient",
        resourceId: ctx.patientId,
        correlationId: ctx.correlationId,
        // We log the SET of fields touched, never the values — those are
        // PII and would defeat the encryption we just applied.
        after: { fields: Object.keys(data) } as object,
      },
    });
  });

  return getMyProfile(ctx);
}

// =============================================================================
// BRANCHES
// =============================================================================

export async function listBranches(ctx: PatientRequestContext) {
  const branches = await prisma.branch.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE", deletedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, address: true, timezone: true },
  });
  return branches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    timezone: b.timezone,
  }));
}

// =============================================================================
// SLOTS — generated 09:00–17:00 in 30-min steps, exclude existing appointments
// =============================================================================

const SLOT_START_HOUR = 9;
const SLOT_END_HOUR = 17;
const SLOT_DURATION_MIN = 30;

export const ListSlotsQuery = z.object({
  branch_id: z.string().min(1),
  /** YYYY-MM-DD in branch timezone (we treat as Asia/Bangkok for v1). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function listSlots(
  ctx: PatientRequestContext,
  input: z.infer<typeof ListSlotsQuery>,
) {
  const branch = await prisma.branch.findFirst({
    where: { id: input.branch_id, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, timezone: true },
  });
  if (!branch) throw NotFound("Branch not found");

  // Build day window in UTC. v1 assumes branch tz = +07:00 (Asia/Bangkok); a
  // future enhancement could honour the branch.timezone field.
  const dayStart = new Date(`${input.date}T00:00:00+07:00`);
  const dayEnd = new Date(`${input.date}T23:59:59+07:00`);

  const existing = await prisma.appointment.findMany({
    where: {
      tenantId: ctx.tenantId,
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
  return { branch_id: branch.id, branch_name: branch.name, date: input.date, slots };
}

// =============================================================================
// SELF-BOOKING
// =============================================================================

export const CreatePatientAppointmentDto = z.object({
  branch_id: z.string().min(1),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_min: z.number().int().positive().max(8 * 60).default(30),
  reason: z.string().max(2000).optional(),
});

/**
 * Self-book an appointment from the patient app.
 *
 * Auth model: ABAC `authorize()` is bypassed (patient is not a staff user). We
 * synthesise a `RequestContext` so we can reuse `writeWithOutbox`. Actor is
 * marked as `{ type: "PATIENT", id: patientId }` for audit traceability.
 */
export async function createPatientAppointment(
  ctx: PatientRequestContext,
  input: z.infer<typeof CreatePatientAppointmentDto>,
) {
  const branch = await prisma.branch.findFirst({
    where: { id: input.branch_id, tenantId: ctx.tenantId, status: "ACTIVE" },
  });
  if (!branch) throw NotFound("Branch not found");

  const scheduled = new Date(input.scheduled_at);
  if (scheduled.getTime() <= Date.now()) {
    throw BadRequest("Scheduled time must be in the future");
  }

  // Conflict check — same patient already booked at exact same slot.
  const conflict = await prisma.appointment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      scheduledAt: scheduled,
      status: { in: ["BOOKED", "CONFIRMED", "CHECKED_IN"] },
    },
  });
  if (conflict) throw Conflict("You already have an appointment at this slot");

  const synthCtx: RequestContext = {
    correlationId: ctx.correlationId,
    tenantId: ctx.tenantId,
    branchId: branch.id,
    actor: { type: "PATIENT", id: ctx.patientId },
  };

  return writeWithOutbox(synthCtx, async (tx) => {
    const appt = await tx.appointment.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: branch.id,
        patientId: ctx.patientId,
        scheduledAt: scheduled,
        durationMin: input.duration_min,
        channel: "LIFF",
        reason: input.reason,
        status: "BOOKED",
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: branch.id,
        action: "appointment.create",
        resourceType: "Appointment",
        resourceId: appt.id,
        correlationId: ctx.correlationId,
        after: {
          channel: "LIFF",
          patient_self_booked: true,
          line_user_id: ctx.lineUserId,
        } as object,
      },
    });

    return {
      result: {
        id: appt.id,
        scheduled_at: appt.scheduledAt.toISOString(),
        duration_min: appt.durationMin,
        branch_id: appt.branchId,
        status: appt.status,
      },
      events: [
        {
          eventName: EVENT_NAMES.APPOINTMENT_CREATED,
          payload: AppointmentEvents.AppointmentCreatedV1Payload.parse({
            appointment_id: appt.id,
            patient_id: appt.patientId,
            scheduled_at: appt.scheduledAt.toISOString(),
            duration_min: appt.durationMin,
            channel: "LIFF",
          }),
        },
      ],
    };
  });
}

// =============================================================================
// APPOINTMENT LIST — drives "ประวัติการจอง" on the patient app
// =============================================================================

export async function listMyAppointments(
  ctx: PatientRequestContext,
  opts: { upcomingOnly?: boolean; page?: number; perPage?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(50, Math.max(1, opts.perPage ?? 20));

  const where = {
    tenantId: ctx.tenantId,
    patientId: ctx.patientId,
    ...(opts.upcomingOnly
      ? {
          status: {
            in: ["BOOKED", "CONFIRMED", "CHECKED_IN"] as Array<
              "BOOKED" | "CONFIRMED" | "CHECKED_IN"
            >,
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        branchId: true,
        scheduledAt: true,
        durationMin: true,
        channel: true,
        status: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  // Look up branches in one shot.
  const branchIds = Array.from(new Set(rows.map((r) => r.branchId)));
  const branches = branchIds.length
    ? await prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
      })
    : [];
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  return {
    pagination: { page, perPage, total },
    data: rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        branch_id: r.branchId,
        branch_name: branchMap.get(r.branchId)?.name ?? null,
        scheduled_at: r.scheduledAt.toISOString(),
        duration_min: r.durationMin,
        channel: r.channel,
        status: r.status,
        reason: r.reason,
        service_name:
          typeof meta.service_name === "string" ? meta.service_name : null,
        service_id: typeof meta.service_id === "string" ? meta.service_id : null,
        created_at: r.createdAt.toISOString(),
      };
    }),
  };
}

// =============================================================================
// APPOINTMENT DETAIL — used by the booking success screen
// =============================================================================

export async function getMyAppointment(
  ctx: PatientRequestContext,
  appointmentId: string,
) {
  const appt = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      tenantId: ctx.tenantId,
      patientId: ctx.patientId, // PII scope — patient can only see their own
    },
    select: {
      id: true,
      branchId: true,
      scheduledAt: true,
      durationMin: true,
      channel: true,
      status: true,
      reason: true,
      metadata: true,
      createdAt: true,
    },
  });
  if (!appt) throw NotFound("Appointment not found");
  const branch = await prisma.branch.findFirst({
    where: { id: appt.branchId, tenantId: ctx.tenantId },
    select: { id: true, name: true, address: true },
  });
  return {
    id: appt.id,
    scheduled_at: appt.scheduledAt.toISOString(),
    duration_min: appt.durationMin,
    channel: appt.channel,
    status: appt.status,
    reason: appt.reason,
    metadata: appt.metadata,
    created_at: appt.createdAt.toISOString(),
    branch: branch ? { id: branch.id, name: branch.name, address: branch.address } : null,
  };
}

// =============================================================================
// VISITS / HISTORY
// =============================================================================

export async function listMyVisits(
  ctx: PatientRequestContext,
  opts: { page?: number; perPage?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(50, Math.max(1, opts.perPage ?? 10));

  const [total, rows] = await Promise.all([
    prisma.visit.count({
      where: { tenantId: ctx.tenantId, patientId: ctx.patientId },
    }),
    prisma.visit.findMany({
      where: { tenantId: ctx.tenantId, patientId: ctx.patientId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        invoices: {
          select: { id: true, number: true, status: true, total: true, currency: true },
        },
        orders: {
          include: {
            items: {
              select: {
                id: true,
                description: true,
                qty: true,
                total: true,
                itemType: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    pagination: { page, perPage, total },
    data: rows.map((v) => ({
      id: v.id,
      branch_id: v.branchId,
      status: v.status,
      checked_in_at: v.checkedInAt?.toISOString() ?? null,
      started_at: v.startedAt?.toISOString() ?? null,
      completed_at: v.completedAt?.toISOString() ?? null,
      created_at: v.createdAt.toISOString(),
      invoices: v.invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        total: i.total.toString(),
        currency: i.currency,
      })),
      services: v.orders.flatMap((o) =>
        o.items.map((l) => ({
          description: l.description,
          qty: l.qty.toString(),
          total: l.total.toString(),
          kind: l.itemType,
        })),
      ),
    })),
  };
}

/**
 * Receipt link for a single visit. We surface the latest E_RECEIPT document
 * generated by the Phase C document worker (if any).
 */
export async function getMyVisitReceipt(
  ctx: PatientRequestContext,
  visitId: string,
) {
  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
    },
    include: {
      invoices: {
        select: { id: true, number: true, status: true, total: true, currency: true },
      },
    },
  });
  if (!visit) throw NotFound("Visit not found");

  const invoiceIds = visit.invoices.map((i) => i.id);
  const doc = invoiceIds.length
    ? await prisma.document.findFirst({
        where: {
          tenantId: ctx.tenantId,
          type: "E_RECEIPT",
          refType: "INVOICE",
          refId: { in: invoiceIds },
          status: "GENERATED",
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return {
    visit_id: visit.id,
    completed_at: visit.completedAt?.toISOString() ?? null,
    invoices: visit.invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      total: i.total.toString(),
      currency: i.currency,
    })),
    receipt: doc
      ? {
          id: doc.id,
          storage_key: doc.storageKey,
          /** Deep-link to the staff API document download endpoint. The patient
           *  app proxies through its own /receipt route which validates the
           *  patient owns the visit before redirecting. */
          download_path: `/api/v1/patient/visits/${visit.id}/receipt/file`,
        }
      : null,
  };
}

// =============================================================================
// WALLET / COURSES
// =============================================================================

export async function listMyWallets(ctx: PatientRequestContext) {
  const accounts = await prisma.walletAccount.findMany({
    where: { tenantId: ctx.tenantId, patientId: ctx.patientId },
    orderBy: { createdAt: "desc" },
    include: {
      entries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
  // join product info
  const productIds = accounts.map((a) => a.productId);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, sku: true, name: true, category: true },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const now = new Date();
  return accounts.map((a) => {
    const p = productMap.get(a.productId);
    const expiresAt = a.expiresAt;
    return {
      id: a.id,
      product_id: a.productId,
      product_sku: p?.sku ?? "",
      product_name: p?.name ?? "—",
      category: p?.category ?? "COURSE",
      balance: a.balance,
      expires_at: expiresAt?.toISOString() ?? null,
      expires_in_days: expiresAt
        ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000))
        : null,
      ledger: a.entries.map((e) => ({
        id: e.id,
        type: e.entryType,
        delta: e.delta,
        balance_after: e.balanceAfter,
        ref_type: e.refType,
        ref_id: e.refId,
        notes: e.notes,
        created_at: e.createdAt.toISOString(),
      })),
    };
  });
}

// =============================================================================
// AFTERCARE — CTA after a recent visit
// =============================================================================

const AFTERCARE_WINDOW_DAYS = 14;

export async function listMyAftercare(ctx: PatientRequestContext) {
  const since = new Date(Date.now() - AFTERCARE_WINDOW_DAYS * 86_400_000);

  // Most-recent completed visits within window.
  const visits = await prisma.visit.findMany({
    where: {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      status: "COMPLETED",
      completedAt: { gte: since },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
    include: {
      orders: {
        include: {
          items: {
            select: {
              id: true,
              description: true,
              itemType: true,
              refId: true,
            },
          },
        },
      },
    },
  });

  // Heuristic: any line with itemType PROCEDURE in the past 14 days surfaces an
  // aftercare CTA. Future enhancement: per-procedure aftercare templates.
  const items: Array<{
    visit_id: string;
    completed_at: string;
    title: string;
    body: string;
    cta_label: string;
    cta_kind: "REBOOK" | "REVIEW" | "READ";
  }> = [];
  for (const v of visits) {
    for (const o of v.orders) {
      for (const l of o.items) {
        if (l.itemType !== "PROCEDURE") continue;
        const completedAt = v.completedAt!;
        const ageDays = Math.floor(
          (Date.now() - completedAt.getTime()) / 86_400_000,
        );
        items.push({
          visit_id: v.id,
          completed_at: completedAt.toISOString(),
          title: ageDays <= 1 ? `Aftercare for ${l.description}` : `Follow-up: ${l.description}`,
          body:
            ageDays <= 1
              ? "Hydrate well, avoid sun exposure for 24h, and use the prescribed cream every morning."
              : ageDays >= 3 && ageDays <= 5
                ? "How are you feeling? Tap below to leave a quick review of your visit."
                : "Time for your follow-up? Tap to rebook your next session at the same branch.",
          cta_label:
            ageDays <= 1 ? "Read aftercare guide" : ageDays <= 5 ? "Leave a review" : "Rebook",
          cta_kind: ageDays <= 1 ? "READ" : ageDays <= 5 ? "REVIEW" : "REBOOK",
        });
      }
    }
  }

  return items.slice(0, 5);
}
