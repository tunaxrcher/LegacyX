import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma, Prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import type { RequestContext } from "../../shared/context";

/**
 * Phase R — Clinical safety net (Phase 1).
 *
 * Allergies are stored on the existing `Patient.allergies` JSON column
 * (already in the schema). We keep them as a JSON array of structured
 * records so we don't need a migration to ship clinical safety value, but
 * we enforce a Zod shape on every read/write so the contract is concrete.
 *
 * Drug-allergy matching during ordering:
 *   • Each `Product.attributes` may include `activeIngredients: string[]`
 *     (case-insensitive). Catalog admins fill these in for medications.
 *   • `assertNoAllergyConflict` scans the patient's allergy list against
 *     the activeIngredients of every MEDICATION line being ordered.
 *   • A conflict throws `Conflict` UNLESS the caller passes
 *     `acknowledgedAllergyIds` containing the matching allergy id (this
 *     is the override path — UI must collect a reason and the audit log
 *     records the override).
 */

export const AllergyCategory = z.enum(["DRUG", "FOOD", "ENVIRONMENTAL", "OTHER"]);
export const AllergySeverity = z.enum([
  "MILD",
  "MODERATE",
  "SEVERE",
  "LIFE_THREATENING",
]);

/** The on-disk shape of a single allergy entry. */
export const AllergyRecordSchema = z.object({
  id: z.string().min(1),
  substance: z.string().min(1).max(120),
  category: AllergyCategory,
  severity: AllergySeverity,
  reaction: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
  recordedAt: z.string().datetime({ offset: true }),
  recordedBy: z.string(),
});
export type AllergyRecord = z.infer<typeof AllergyRecordSchema>;

export const AllergyListSchema = z.array(AllergyRecordSchema);

/** What a clinician posts when adding a new allergy. */
export const AddAllergyDto = z.object({
  substance: z.string().min(1).max(120),
  category: AllergyCategory,
  severity: AllergySeverity,
  reaction: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

/** Read the allergy array off a patient row, gracefully handling legacy/null values. */
export function parseAllergyList(value: unknown): AllergyRecord[] {
  if (!value) return [];
  const r = AllergyListSchema.safeParse(value);
  if (r.success) return r.data;
  // Legacy rows (free-text array, etc.) — return empty, never crash the API.
  return [];
}

export async function listAllergies(ctx: RequestContext, patientId: string) {
  await authorize(ctx, { resource: "patient", action: "read" });
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId: ctx.tenantId, deletedAt: null },
    select: { allergies: true },
  });
  if (!patient) throw NotFound(`Patient ${patientId} not found`);
  return parseAllergyList(patient.allergies);
}

export async function addAllergy(
  ctx: RequestContext,
  patientId: string,
  input: z.infer<typeof AddAllergyDto>,
) {
  await authorize(ctx, { resource: "patient", action: "write" });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId = ctx.actor.id;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true, allergies: true },
  });
  if (!patient) throw NotFound(`Patient ${patientId} not found`);

  const list = parseAllergyList(patient.allergies);
  // Block exact-substance duplicates so the UI doesn't accumulate noise.
  if (
    list.some(
      (a) => a.substance.trim().toLowerCase() === input.substance.trim().toLowerCase(),
    )
  ) {
    throw Conflict(`Allergy "${input.substance}" already on record`);
  }

  const next: AllergyRecord = {
    id: randomUUID(),
    substance: input.substance.trim(),
    category: input.category,
    severity: input.severity,
    reaction: input.reaction,
    note: input.note,
    recordedAt: new Date().toISOString(),
    recordedBy: actorId,
  };
  const updated = [...list, next];

  await prisma.patient.update({
    where: { id: patient.id },
    data: { allergies: updated as unknown as Prisma.InputJsonValue },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: actorId,
      action: "allergy.add",
      resourceType: "Patient",
      resourceId: patient.id,
      correlationId: ctx.correlationId,
      after: { allergyId: next.id, substance: next.substance, severity: next.severity },
    },
  });
  return next;
}

export async function removeAllergy(
  ctx: RequestContext,
  patientId: string,
  allergyId: string,
) {
  await authorize(ctx, { resource: "patient", action: "write" });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true, allergies: true },
  });
  if (!patient) throw NotFound(`Patient ${patientId} not found`);

  const list = parseAllergyList(patient.allergies);
  const target = list.find((a) => a.id === allergyId);
  if (!target) throw NotFound(`Allergy ${allergyId} not found`);

  const updated = list.filter((a) => a.id !== allergyId);
  await prisma.patient.update({
    where: { id: patient.id },
    data: { allergies: updated as unknown as Prisma.InputJsonValue },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "allergy.remove",
      resourceType: "Patient",
      resourceId: patient.id,
      correlationId: ctx.correlationId,
      before: { allergyId: target.id, substance: target.substance },
    },
  });
  return { ok: true };
}

/**
 * Conflict shape returned to the UI so it can highlight the offending
 * allergy + product pair and gather a reason to override.
 */
export interface AllergyConflict {
  allergyId: string;
  substance: string;
  severity: AllergyRecord["severity"];
  productId: string;
  productName: string;
  matchedIngredient: string;
}

/** Pure helper — exported for tests. Does the case-insensitive match. */
export function findAllergyConflicts(
  allergies: AllergyRecord[],
  products: Array<{ id: string; name: string; activeIngredients: string[] }>,
): AllergyConflict[] {
  const conflicts: AllergyConflict[] = [];
  const drugAllergies = allergies.filter((a) => a.category === "DRUG");
  for (const product of products) {
    for (const ing of product.activeIngredients) {
      const ingLow = ing.trim().toLowerCase();
      if (!ingLow) continue;
      for (const allergy of drugAllergies) {
        const sub = allergy.substance.trim().toLowerCase();
        if (
          sub === ingLow ||
          ingLow.includes(sub) ||
          sub.includes(ingLow)
        ) {
          conflicts.push({
            allergyId: allergy.id,
            substance: allergy.substance,
            severity: allergy.severity,
            productId: product.id,
            productName: product.name,
            matchedIngredient: ing,
          });
        }
      }
    }
  }
  return conflicts;
}

/**
 * Throw a structured `Conflict` if any of the provided MEDICATION product
 * ids would clash with the patient's recorded allergies, UNLESS the caller
 * already acknowledged each conflict by passing the matching allergyIds.
 *
 * Used inside `createOrder` (and re-usable from anywhere that prescribes).
 */
export async function assertNoAllergyConflict(opts: {
  ctx: RequestContext;
  patientId: string;
  productIds: string[];
  acknowledgedAllergyIds?: string[];
}): Promise<{ overrides: AllergyConflict[] }> {
  const { ctx, patientId, productIds, acknowledgedAllergyIds = [] } = opts;
  if (productIds.length === 0) return { overrides: [] };

  const [patient, products] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, tenantId: ctx.tenantId, deletedAt: null },
      select: { allergies: true },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: ctx.tenantId },
      select: { id: true, name: true, attributes: true },
    }),
  ]);
  if (!patient) throw NotFound(`Patient ${patientId} not found`);

  const allergies = parseAllergyList(patient.allergies);
  if (allergies.length === 0) return { overrides: [] };

  const productInputs = products.map((p) => {
    const attrs = (p.attributes as Record<string, unknown> | null) ?? {};
    const ingredientsRaw = attrs.activeIngredients;
    const activeIngredients = Array.isArray(ingredientsRaw)
      ? ingredientsRaw.filter((x): x is string => typeof x === "string")
      : [];
    return { id: p.id, name: p.name, activeIngredients };
  });

  const conflicts = findAllergyConflicts(allergies, productInputs);
  if (conflicts.length === 0) return { overrides: [] };

  const ackSet = new Set(acknowledgedAllergyIds);
  const blocking = conflicts.filter((c) => !ackSet.has(c.allergyId));
  if (blocking.length > 0) {
    const summary = blocking
      .map((c) => `${c.productName} ↔ ${c.substance} (${c.severity})`)
      .join("; ");
    throw Conflict(
      `ALLERGY_CONFLICT: ${summary}. Override by acknowledging the matching allergy ids.`,
      { kind: "ALLERGY_CONFLICT", conflicts: blocking },
    );
  }

  // All conflicts were acknowledged — return them so the caller can audit-log.
  return { overrides: conflicts };
}
