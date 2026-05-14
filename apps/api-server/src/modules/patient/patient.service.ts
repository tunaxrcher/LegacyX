/**
 * Staff-facing patient module.
 *
 * Reception/Doctor/Manager creates and edits Patient rows from the
 * backoffice. Distinct from `public_catalog.publicBook` which auto-creates
 * patients during guest booking.
 *
 * ABAC: `patient:write:branch` for create + update.
 */
import { z } from "zod";
import { prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { encryptField, decryptField, searchableHash } from "../../shared/crypto";
import { nextHN } from "../../shared/hn";
import type { RequestContext } from "../../shared/context";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

const PhoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{6,32}$/, "Invalid phone number");

export const CreatePatientDto = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  nickname: z.string().trim().max(80).optional(),
  national_id: z
    .string()
    .trim()
    .regex(/^[0-9\- ]{6,20}$/)
    .optional(),
  phone: PhoneSchema.optional(),
  email: z.string().trim().email().max(160).optional(),
  dob: z.string().datetime({ offset: true }).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  blood_type: z.string().max(8).optional(),
  allergies: z.array(z.string().max(120)).optional(),
  chronic_conditions: z.array(z.string().max(120)).optional(),
  home_branch_id: z.string().optional(),
});
export type CreatePatientInput = z.infer<typeof CreatePatientDto>;

export const UpdatePatientDto = CreatePatientDto.partial();
export type UpdatePatientInput = z.infer<typeof UpdatePatientDto>;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPatient(ctx: RequestContext, input: CreatePatientInput) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  // Phone is the only soft-uniqueness key we honour at create-time. Same
  // tenant + same phoneHash → reject (we never want two HN rows for one
  // person; merging is a separate workflow).
  let phoneHash: string | null = null;
  if (input.phone) {
    phoneHash = searchableHash(ctx.tenantId, input.phone);
    const existing = await prisma.patient.findFirst({
      where: { tenantId: ctx.tenantId, phoneHash, deletedAt: null },
      select: { id: true, hn: true },
    });
    if (existing) {
      throw Conflict(
        `Patient with this phone already exists (HN ${existing.hn}). Use that record or merge instead.`,
      );
    }
  }

  return writeWithOutbox(ctx, async (tx) => {
    const hn = await nextHN(ctx.tenantId);
    const created = await tx.patient.create({
      data: {
        tenantId: ctx.tenantId,
        hn,
        firstName: input.first_name,
        lastName: input.last_name,
        nicknameEnc: input.nickname ? encryptField(input.nickname) : null,
        nationalIdEnc: input.national_id ? encryptField(input.national_id) : null,
        dob: input.dob ? new Date(input.dob) : null,
        gender: input.gender ?? null,
        phoneEnc: input.phone ? encryptField(input.phone) : null,
        emailEnc: input.email ? encryptField(input.email) : null,
        phoneHash,
        bloodType: input.blood_type ?? null,
        allergies: input.allergies ?? undefined,
        chronicConditions: input.chronic_conditions ?? undefined,
        homeBranchId: input.home_branch_id ?? ctx.branchId ?? null,
        status: "ACTIVE",
        verificationStatus: "UNVERIFIED",
      },
      select: { id: true, hn: true, firstName: true, lastName: true },
    });
    return {
      result: created,
      // Patient creation doesn't have a versioned event yet — use a generic
      // audit-only entry instead of fabricating one. (Revisit when a
      // `patient.created` schema lands in `@legacyx/events`.)
      events: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updatePatient(
  ctx: RequestContext,
  patientId: string,
  input: UpdatePatientInput,
) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  const existing = await prisma.patient.findFirst({
    where: { id: patientId, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true, phoneHash: true },
  });
  if (!existing) throw NotFound(`Patient ${patientId} not found`);

  let phoneHash: string | null | undefined = undefined;
  if (input.phone !== undefined) {
    phoneHash = input.phone ? searchableHash(ctx.tenantId, input.phone) : null;
    if (phoneHash) {
      const dup = await prisma.patient.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phoneHash,
          deletedAt: null,
          id: { not: patientId },
        },
        select: { id: true, hn: true },
      });
      if (dup) {
        throw Conflict(
          `Phone already used by HN ${dup.hn}. Merge instead of editing.`,
        );
      }
    }
  }

  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: {
      ...(input.first_name !== undefined && { firstName: input.first_name }),
      ...(input.last_name !== undefined && { lastName: input.last_name }),
      ...(input.nickname !== undefined && {
        nicknameEnc: input.nickname ? encryptField(input.nickname) : null,
      }),
      ...(input.national_id !== undefined && {
        nationalIdEnc: input.national_id ? encryptField(input.national_id) : null,
      }),
      ...(input.dob !== undefined && {
        dob: input.dob ? new Date(input.dob) : null,
      }),
      ...(input.gender !== undefined && { gender: input.gender ?? null }),
      ...(input.phone !== undefined && {
        phoneEnc: input.phone ? encryptField(input.phone) : null,
      }),
      ...(phoneHash !== undefined && { phoneHash }),
      ...(input.email !== undefined && {
        emailEnc: input.email ? encryptField(input.email) : null,
      }),
      ...(input.blood_type !== undefined && { bloodType: input.blood_type ?? null }),
      ...(input.allergies !== undefined && { allergies: input.allergies }),
      ...(input.chronic_conditions !== undefined && {
        chronicConditions: input.chronic_conditions,
      }),
      ...(input.home_branch_id !== undefined && {
        homeBranchId: input.home_branch_id ?? null,
      }),
    },
    select: { id: true, hn: true, firstName: true, lastName: true },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Decrypted detail (used by /patients/[id] page)
// ---------------------------------------------------------------------------

export async function getPatientDetail(ctx: RequestContext, patientId: string) {
  await authorize(ctx, {
    resource: "patient",
    action: "read",
    target: { branchId: ctx.branchId },
  });

  const p = await prisma.patient.findFirst({
    where: { id: patientId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!p) throw NotFound(`Patient ${patientId} not found`);

  // Fetch the home branch separately — there's no FK relation on Patient.
  const homeBranch = p.homeBranchId
    ? await prisma.branch.findUnique({
        where: { id: p.homeBranchId },
        select: { id: true, code: true, name: true },
      })
    : null;

  return {
    id: p.id,
    hn: p.hn,
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: p.nicknameEnc ? safeDecrypt(p.nicknameEnc) : null,
    nationalId: p.nationalIdEnc ? safeDecrypt(p.nationalIdEnc) : null,
    phone: p.phoneEnc ? safeDecrypt(p.phoneEnc) : null,
    email: p.emailEnc ? safeDecrypt(p.emailEnc) : null,
    dob: p.dob,
    gender: p.gender,
    bloodType: p.bloodType,
    allergies: p.allergies,
    chronicConditions: p.chronicConditions,
    homeBranch,
    homeBranchId: p.homeBranchId,
    verificationStatus: p.verificationStatus,
    status: p.status,
    lineUserId: p.lineUserId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function safeDecrypt(cipher: string): string | null {
  try {
    return decryptField(cipher);
  } catch {
    return null;
  }
}
