/**
 * Patient-facing Service Catalog admin (Phase G).
 *
 * Mirrors the pattern of `catalog-admin.service.ts` but operates on the
 * `ServiceCategory` and `Service` tables that the patient app's welcome
 * screen consumes (see `/api/v1/public/categories`).
 *
 * Guarded by `catalog:manage:tenant` — same permission that already governs
 * Product/BOM editing, so MANAGER/ADMIN can administer everything from one
 * UI screen without an additional permission grant.
 */
import { z } from "zod";
import { prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import type { RequestContext } from "../../shared/context";

// =============================================================================
// PROCEDURE LIST (for the dropdown in CreateService / EditService)
// =============================================================================

/**
 * Lists all known procedure codes — both the curated set hard-coded in
 * `catalog.service.ts` AND anything that has a BOM in the tenant. Returns a
 * deduped, sorted array so the admin UI can present it as a dropdown rather
 * than asking the user to remember the code.
 */
export async function listProceduresForAdmin(ctx: RequestContext) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const STATIC: Array<{ code: string; name: string; default_price: number }> = [
    { code: "PROC_BTX_FACE", name: "Botox — Full Face (50 U)", default_price: 9500 },
    { code: "PROC_BTX_FOREHEAD", name: "Botox — Forehead (20 U)", default_price: 4500 },
    { code: "PROC_FILLER_CHEEK", name: "Hyaluronic Filler — Cheek (1 cc)", default_price: 12000 },
    { code: "PROC_LASER_HAIR", name: "Laser Hair Removal — Underarm", default_price: 1500 },
    { code: "PROC_FACIAL_BASIC", name: "Basic Facial Treatment", default_price: 1200 },
    { code: "PROC_VITAMIN_IV", name: "Vitamin IV Drip", default_price: 2500 },
    { code: "PROC_CONSULT", name: "Doctor Consultation", default_price: 500 },
  ];

  // Fold in any extra procedure codes referenced by tenant BOMs
  const bomRefs = await prisma.bOM.findMany({
    where: { tenantId: ctx.tenantId, ownerType: "PROCEDURE", active: true },
    select: { ownerRef: true },
    distinct: ["ownerRef"],
  });
  const knownCodes = new Set(STATIC.map((p) => p.code));
  const extras = bomRefs
    .filter((b) => !knownCodes.has(b.ownerRef))
    .map((b) => ({
      code: b.ownerRef,
      name: b.ownerRef.replace(/^PROC_/, "").replace(/_/g, " "),
      default_price: 0,
    }));

  return [...STATIC, ...extras].sort((a, b) => a.code.localeCompare(b.code));
}

// =============================================================================
// CATEGORIES
// =============================================================================

export const ServiceCategoryDto = z.object({
  // `code` is OPTIONAL on create — server derives it from `name` (slug-style)
  // when omitted, so non-technical users don't need to invent codes.
  code: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9_-]+$/i, "code must be slug-style (a-z, 0-9, _ , -)")
    .optional(),
  name: z.string().min(1).max(120),
  name_th: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  description_th: z.string().max(2000).optional(),
  image_url: z.string().url().max(500).optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
export const UpdateServiceCategoryDto = ServiceCategoryDto.partial();

function slugifyCategoryCode(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48) || "category";
}

function slugifyServiceCode(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .slice(0, 64) || "SVC";
}

/**
 * Returns `desired` if free in this tenant, otherwise appends `-2`, `-3`...
 * until a free code is found. Keeps the code stable when re-running.
 */
async function ensureUniqueCategoryCode(
  tenantId: string,
  desired: string,
): Promise<string> {
  let candidate = desired;
  let n = 2;
  // bound the loop to avoid pathological cases
  while (n < 100) {
    const clash = await prisma.serviceCategory.findFirst({
      where: { tenantId, code: candidate },
    });
    if (!clash) return candidate;
    candidate = `${desired}-${n++}`;
  }
  return `${desired}-${Date.now()}`;
}

async function ensureUniqueServiceCode(
  tenantId: string,
  desired: string,
): Promise<string> {
  let candidate = desired;
  let n = 2;
  while (n < 100) {
    const clash = await prisma.service.findFirst({
      where: { tenantId, code: candidate },
    });
    if (!clash) return candidate;
    candidate = `${desired}_${n++}`;
  }
  return `${desired}_${Date.now()}`;
}

export async function listCategoriesAdmin(ctx: RequestContext) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const rows = await prisma.serviceCategory.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { services: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    name_th: r.nameTh,
    description: r.description,
    description_th: r.descriptionTh,
    image_url: r.imageUrl,
    display_order: r.displayOrder,
    active: r.active,
    service_count: r._count.services,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  }));
}

export async function createCategory(
  ctx: RequestContext,
  input: z.infer<typeof ServiceCategoryDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });

  // Auto-derive code from name when caller didn't supply one. If the caller
  // DID supply a code, honour it but still de-conflict (rare edge case where
  // two admins create the same code simultaneously).
  const code = input.code
    ? await ensureUniqueCategoryCode(ctx.tenantId, input.code.toLowerCase())
    : await ensureUniqueCategoryCode(ctx.tenantId, slugifyCategoryCode(input.name));

  const created = await prisma.serviceCategory.create({
    data: {
      tenantId: ctx.tenantId,
      code,
      name: input.name,
      nameTh: input.name_th,
      description: input.description,
      descriptionTh: input.description_th,
      imageUrl: input.image_url,
      displayOrder: input.display_order ?? 0,
      active: input.active ?? true,
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "catalog.service_category.create",
      resourceType: "ServiceCategory",
      resourceId: created.id,
      correlationId: ctx.correlationId,
      after: { code: created.code, name: created.name } as object,
    },
  });
  return created;
}

export async function updateCategory(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof UpdateServiceCategoryDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.serviceCategory.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) throw NotFound(`Category ${id} not found`);

  if (input.code && input.code !== existing.code) {
    const clash = await prisma.serviceCategory.findFirst({
      where: {
        tenantId: ctx.tenantId,
        code: input.code,
        NOT: { id },
      },
    });
    if (clash) throw Conflict(`Category code "${input.code}" already exists`);
  }

  const updated = await prisma.serviceCategory.update({
    where: { id },
    data: {
      code: input.code ?? undefined,
      name: input.name ?? undefined,
      nameTh: input.name_th ?? undefined,
      description: input.description ?? undefined,
      descriptionTh: input.description_th ?? undefined,
      imageUrl: input.image_url ?? undefined,
      displayOrder: input.display_order ?? undefined,
      active: input.active ?? undefined,
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "catalog.service_category.update",
      resourceType: "ServiceCategory",
      resourceId: updated.id,
      correlationId: ctx.correlationId,
      after: input as object,
    },
  });
  return updated;
}

export async function deleteCategory(ctx: RequestContext, id: string) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.serviceCategory.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { services: true } } },
  });
  if (!existing) throw NotFound(`Category ${id} not found`);
  if (existing._count.services > 0) {
    throw BadRequest(
      `Category has ${existing._count.services} service(s). Move or delete them first.`,
    );
  }
  await prisma.serviceCategory.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "catalog.service_category.delete",
      resourceType: "ServiceCategory",
      resourceId: id,
      correlationId: ctx.correlationId,
    },
  });
  return { id };
}

// =============================================================================
// SERVICES
// =============================================================================

export const ServiceDto = z.object({
  category_id: z.string().min(1),
  // Optional on create — server derives UPPER_SNAKE_CASE from `name`.
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "code must be UPPER_SNAKE (A-Z, 0-9, _)")
    .optional(),
  name: z.string().min(1).max(200),
  name_th: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  description_th: z.string().max(2000).optional(),
  price_from: z.number().nonnegative().nullable().optional(),
  price_to: z.number().nonnegative().nullable().optional(),
  duration_min: z.number().int().positive().max(8 * 60).optional(),
  image_url: z.string().url().max(500).optional(),
  procedure_code: z.string().max(64).optional().nullable(),
  display_order: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
export const UpdateServiceDto = ServiceDto.partial();

export async function listServicesAdmin(
  ctx: RequestContext,
  args: { category_id?: string; q?: string },
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const q = args.q?.trim();
  const rows = await prisma.service.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(args.category_id ? { categoryId: args.category_id } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { nameTh: { contains: q } },
              { code: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: { category: { select: { id: true, code: true, name: true, nameTh: true } } },
    take: 200,
  });
  return rows.map((s) => ({
    id: s.id,
    category_id: s.categoryId,
    category: {
      id: s.category.id,
      code: s.category.code,
      name: s.category.name,
      name_th: s.category.nameTh,
    },
    code: s.code,
    name: s.name,
    name_th: s.nameTh,
    description: s.description,
    description_th: s.descriptionTh,
    price_from: s.priceFrom ? Number(s.priceFrom) : null,
    price_to: s.priceTo ? Number(s.priceTo) : null,
    duration_min: s.durationMin,
    image_url: s.imageUrl,
    procedure_code: s.procedureCode,
    display_order: s.displayOrder,
    active: s.active,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  }));
}

export async function createService(
  ctx: RequestContext,
  input: z.infer<typeof ServiceDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });

  const category = await prisma.serviceCategory.findFirst({
    where: { id: input.category_id, tenantId: ctx.tenantId },
  });
  if (!category) throw BadRequest("Category not found");

  // Derive a service code from name when not supplied. UPPER_SNAKE-ifies and
  // dedupes within tenant so admins never need to think about codes.
  const code = input.code
    ? await ensureUniqueServiceCode(ctx.tenantId, input.code.toUpperCase())
    : await ensureUniqueServiceCode(ctx.tenantId, slugifyServiceCode(input.name));

  const created = await prisma.service.create({
    data: {
      tenantId: ctx.tenantId,
      categoryId: input.category_id,
      code,
      name: input.name,
      nameTh: input.name_th,
      description: input.description,
      descriptionTh: input.description_th,
      priceFrom: input.price_from ?? null,
      priceTo: input.price_to ?? null,
      durationMin: input.duration_min ?? 30,
      imageUrl: input.image_url,
      procedureCode: input.procedure_code ?? null,
      displayOrder: input.display_order ?? 0,
      active: input.active ?? true,
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "catalog.service.create",
      resourceType: "Service",
      resourceId: created.id,
      correlationId: ctx.correlationId,
      after: { code: created.code, name: created.name, category_id: created.categoryId } as object,
    },
  });
  return created;
}

export async function updateService(
  ctx: RequestContext,
  id: string,
  input: z.infer<typeof UpdateServiceDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.service.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) throw NotFound(`Service ${id} not found`);

  if (input.category_id && input.category_id !== existing.categoryId) {
    const cat = await prisma.serviceCategory.findFirst({
      where: { id: input.category_id, tenantId: ctx.tenantId },
    });
    if (!cat) throw BadRequest("Category not found");
  }

  if (input.code && input.code !== existing.code) {
    const clash = await prisma.service.findFirst({
      where: { tenantId: ctx.tenantId, code: input.code, NOT: { id } },
    });
    if (clash) throw Conflict(`Service code "${input.code}" already exists`);
  }

  const updated = await prisma.service.update({
    where: { id },
    data: {
      categoryId: input.category_id ?? undefined,
      code: input.code ?? undefined,
      name: input.name ?? undefined,
      nameTh: input.name_th ?? undefined,
      description: input.description ?? undefined,
      descriptionTh: input.description_th ?? undefined,
      priceFrom: input.price_from === undefined ? undefined : input.price_from,
      priceTo: input.price_to === undefined ? undefined : input.price_to,
      durationMin: input.duration_min ?? undefined,
      imageUrl: input.image_url ?? undefined,
      procedureCode:
        input.procedure_code === undefined ? undefined : input.procedure_code,
      displayOrder: input.display_order ?? undefined,
      active: input.active ?? undefined,
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "catalog.service.update",
      resourceType: "Service",
      resourceId: updated.id,
      correlationId: ctx.correlationId,
      after: input as object,
    },
  });
  return updated;
}

export async function deleteService(ctx: RequestContext, id: string) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.service.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) throw NotFound(`Service ${id} not found`);
  await prisma.service.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actor.id,
      action: "catalog.service.delete",
      resourceType: "Service",
      resourceId: id,
      correlationId: ctx.correlationId,
    },
  });
  return { id };
}
