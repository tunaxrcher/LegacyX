/**
 * Catalog master-data admin. Used by MANAGER/ADMIN to CRUD products (including
 * courses) and BOMs that downstream workflows depend on.
 *
 * Guarded by `catalog:manage:tenant` — tenant-scope because the catalog is
 * shared across branches.
 */
import { z } from "zod";
import { Prisma, prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import type { RequestContext } from "../../shared/context";

// --- Zod DTOs ---------------------------------------------------------------

const PRODUCT_CATEGORIES = [
  "MEDICATION",
  "SUPPLY",
  "DEVICE",
  "COSMETIC",
  "COURSE",
  "OTHER",
] as const;

export const CreateProductDto = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  category: z.enum(PRODUCT_CATEGORIES),
  unit: z.string().min(1).max(32).default("pcs"),
  price: z.number().nonnegative().default(0),
  reorder_level: z.number().int().nonnegative().default(0),
  track_stock: z.boolean().optional(),
  // Course metadata
  sessions: z.number().int().positive().optional(),
  procedure_code: z.string().max(64).optional(),
});

export const UpdateProductDto = CreateProductDto.partial();

export const UpsertBomDto = z.object({
  procedure_code: z.string().min(1).max(64),
  items: z.array(
    z.object({
      product_id: z.string().min(1),
      qty: z.string().min(1), // decimal as string
      unit: z.string().max(32).optional(),
    }),
  ),
});

// --- Helpers ----------------------------------------------------------------

type Attrs = {
  price?: number;
  sessions?: number;
  procedureCode?: string;
  [k: string]: unknown;
};

function buildAttrs(
  input: Partial<z.infer<typeof CreateProductDto>>,
  existing: Attrs = {},
): Attrs {
  const next: Attrs = { ...existing };
  if (input.price !== undefined) next.price = input.price;
  if (input.sessions !== undefined) next.sessions = input.sessions;
  if (input.procedure_code !== undefined) next.procedureCode = input.procedure_code;
  return next;
}

// --- Product CRUD -----------------------------------------------------------

export async function listProducts(
  ctx: RequestContext,
  args: { q?: string; category?: string },
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const q = args.q?.trim();
  return prisma.product.findMany({
    where: {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(args.category ? { category: args.category as never } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { sku: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
  });
}

export async function createProduct(
  ctx: RequestContext,
  input: z.infer<typeof CreateProductDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.product.findFirst({
    where: { tenantId: ctx.tenantId, sku: input.sku, deletedAt: null },
  });
  if (existing) throw Conflict(`SKU "${input.sku}" already exists`);

  const created = await prisma.product.create({
    data: {
      tenantId: ctx.tenantId,
      sku: input.sku,
      name: input.name,
      category: input.category,
      unit: input.unit,
      trackStock: input.track_stock ?? input.category !== "COURSE",
      reorderLevel: input.reorder_level,
      attributes: buildAttrs(input) as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.actor.id,
      action: "catalog.product.create",
      resourceType: "Product",
      resourceId: created.id,
      correlationId: ctx.correlationId,
      after: { sku: created.sku, category: created.category } as object,
    },
  });
  return created;
}

export async function updateProduct(
  ctx: RequestContext,
  productId: string,
  input: z.infer<typeof UpdateProductDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!existing) throw NotFound(`Product ${productId} not found`);

  if (input.sku && input.sku !== existing.sku) {
    const clash = await prisma.product.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sku: input.sku,
        deletedAt: null,
        NOT: { id: productId },
      },
    });
    if (clash) throw Conflict(`SKU "${input.sku}" already exists`);
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      sku: input.sku ?? undefined,
      name: input.name ?? undefined,
      category: input.category ?? undefined,
      unit: input.unit ?? undefined,
      trackStock: input.track_stock ?? undefined,
      reorderLevel: input.reorder_level ?? undefined,
      attributes: buildAttrs(input, (existing.attributes ?? {}) as Attrs) as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.actor.id,
      action: "catalog.product.update",
      resourceType: "Product",
      resourceId: updated.id,
      correlationId: ctx.correlationId,
      after: input as object,
    },
  });
  return updated;
}

export async function softDeleteProduct(ctx: RequestContext, productId: string) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!existing) throw NotFound(`Product ${productId} not found`);
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), active: false },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.actor.id,
      action: "catalog.product.delete",
      resourceType: "Product",
      resourceId: updated.id,
      correlationId: ctx.correlationId,
    },
  });
  return updated;
}

// --- BOM CRUD ---------------------------------------------------------------

export async function getBomByProcedure(ctx: RequestContext, procedureCode: string) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  const bom = await prisma.bOM.findFirst({
    where: {
      tenantId: ctx.tenantId,
      ownerType: "PROCEDURE",
      ownerRef: procedureCode,
      active: true,
    },
    orderBy: { version: "desc" },
    include: {
      items: {
        include: {
          component: {
            select: { id: true, sku: true, name: true, unit: true, category: true },
          },
        },
      },
    },
  });
  return bom;
}

/**
 * Replace the BOM components for a procedure. Deactivates the previous BOM
 * (keeps version history) and creates a new one with the given items.
 */
export async function upsertBomForProcedure(
  ctx: RequestContext,
  input: z.infer<typeof UpsertBomDto>,
) {
  await authorize(ctx, { resource: "catalog", action: "manage" });
  if (input.items.length === 0) {
    // Empty BOM = just deactivate existing; treat as "no BOM"
  }
  return prisma.$transaction(async (tx) => {
    // Validate all product IDs belong to the tenant
    const productIds = input.items.map((it) => it.product_id);
    if (productIds.length > 0) {
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, unit: true },
      });
      if (products.length !== productIds.length) {
        throw BadRequest("One or more products not found");
      }
    }

    // Deactivate existing active BOM (history preserved)
    const prev = await tx.bOM.findFirst({
      where: {
        tenantId: ctx.tenantId,
        ownerType: "PROCEDURE",
        ownerRef: input.procedure_code,
        active: true,
      },
      orderBy: { version: "desc" },
    });
    if (prev) {
      await tx.bOM.update({ where: { id: prev.id }, data: { active: false } });
    }

    const newVersion = (prev?.version ?? 0) + 1;
    const created = await tx.bOM.create({
      data: {
        tenantId: ctx.tenantId,
        ownerType: "PROCEDURE",
        ownerRef: input.procedure_code,
        version: newVersion,
        active: input.items.length > 0,
        items: {
          create: input.items.map((it) => ({
            componentProductId: it.product_id,
            qty: it.qty,
            unit: it.unit ?? "pcs",
          })),
        },
      },
      include: {
        items: {
          include: {
            component: {
              select: { id: true, sku: true, name: true, unit: true, category: true },
            },
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.actor.id,
        action: "catalog.bom.upsert",
        resourceType: "BOM",
        resourceId: created.id,
        correlationId: ctx.correlationId,
        after: {
          procedure_code: input.procedure_code,
          version: newVersion,
          item_count: input.items.length,
        } as object,
      },
    });

    return created;
  });
}
