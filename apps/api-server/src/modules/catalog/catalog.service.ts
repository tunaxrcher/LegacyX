/**
 * Catalog service — returns billable items for the New Order picker.
 *
 * Note: there is no `ProcedureCatalog` table yet (procedures are referenced by
 * free-form code strings on Order/Procedure rows). For now we keep a curated
 * in-code catalog of common aesthetic procedures + their default prices, and
 * fold in any extras discovered via existing `BOM` rows (so a procedure with a
 * BOM is always pickable). Products & courses come from the `Product` table.
 *
 * When the team is ready to formalize this, add a `ProcedureCatalog` model and
 * swap `STATIC_PROCEDURES` for a Prisma query — no other code needs to change.
 */
import { prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export type CatalogItem = {
  refId: string; // value to send as Order.refId
  code: string; // human-friendly code (same as refId for procedures)
  name: string;
  defaultPrice: number;
  itemType: "PROCEDURE" | "PRODUCT" | "MEDICATION" | "COURSE";
  unit?: string;
  meta?: Record<string, unknown>;
};

const STATIC_PROCEDURES: CatalogItem[] = [
  {
    refId: "PROC_BTX_FACE",
    code: "PROC_BTX_FACE",
    name: "Botox — Full Face (50 U)",
    defaultPrice: 9500,
    itemType: "PROCEDURE",
    unit: "session",
  },
  {
    refId: "PROC_BTX_FOREHEAD",
    code: "PROC_BTX_FOREHEAD",
    name: "Botox — Forehead (20 U)",
    defaultPrice: 4500,
    itemType: "PROCEDURE",
    unit: "session",
  },
  {
    refId: "PROC_FILLER_CHEEK",
    code: "PROC_FILLER_CHEEK",
    name: "Hyaluronic Filler — Cheek (1 cc)",
    defaultPrice: 12000,
    itemType: "PROCEDURE",
    unit: "cc",
  },
  {
    refId: "PROC_LASER_HAIR",
    code: "PROC_LASER_HAIR",
    name: "Laser Hair Removal — Underarm",
    defaultPrice: 1500,
    itemType: "PROCEDURE",
    unit: "session",
  },
  {
    refId: "PROC_FACIAL_BASIC",
    code: "PROC_FACIAL_BASIC",
    name: "Basic Facial Treatment",
    defaultPrice: 1200,
    itemType: "PROCEDURE",
    unit: "session",
  },
  {
    refId: "PROC_VITAMIN_IV",
    code: "PROC_VITAMIN_IV",
    name: "Vitamin IV Drip",
    defaultPrice: 2500,
    itemType: "PROCEDURE",
    unit: "session",
  },
  {
    refId: "PROC_CONSULT",
    code: "PROC_CONSULT",
    name: "Doctor Consultation",
    defaultPrice: 500,
    itemType: "PROCEDURE",
    unit: "visit",
  },
];

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export async function searchCatalog(
  ctx: RequestContext,
  args: { type?: string; q?: string; limit?: number },
): Promise<CatalogItem[]> {
  // Reading the catalog requires being able to write orders (clinical staff).
  await authorize(ctx, {
    resource: "order",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  const limit = Math.min(args.limit ?? 20, 50);
  const q = (args.q ?? "").trim();
  const type = args.type?.toUpperCase();

  const results: CatalogItem[] = [];

  if (!type || type === "PROCEDURE") {
    // Static procedures + any extra BOM-only codes
    const bomRefs = await prisma.bOM.findMany({
      where: { tenantId: ctx.tenantId, ownerType: "PROCEDURE", active: true },
      select: { ownerRef: true },
      distinct: ["ownerRef"],
    });
    const knownRefs = new Set(STATIC_PROCEDURES.map((p) => p.refId));
    const extras: CatalogItem[] = bomRefs
      .filter((b) => !knownRefs.has(b.ownerRef))
      .map((b) => ({
        refId: b.ownerRef,
        code: b.ownerRef,
        name: b.ownerRef.replace(/^PROC_/, "").replace(/_/g, " "),
        defaultPrice: 0,
        itemType: "PROCEDURE" as const,
      }));
    const merged = [...STATIC_PROCEDURES, ...extras];
    for (const it of merged) {
      if (fuzzyMatch(`${it.code} ${it.name}`, q)) results.push(it);
    }
  }

  if (!type || type === "PRODUCT" || type === "MEDICATION" || type === "COURSE") {
    // Map Product.category → catalog itemType
    const categoryFilter =
      type === "MEDICATION"
        ? ["MEDICATION"]
        : type === "PRODUCT"
          ? ["SUPPLY", "DEVICE", "COSMETIC", "OTHER"]
          : type === "COURSE"
            ? ["COURSE"]
            : ["MEDICATION", "SUPPLY", "DEVICE", "COSMETIC", "COURSE", "OTHER"];

    const products = await prisma.product.findMany({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        category: { in: categoryFilter as never },
        OR: q
          ? [
              { sku: { contains: q } },
              { name: { contains: q } },
            ]
          : undefined,
      },
      take: limit,
      orderBy: { name: "asc" },
    });

    for (const p of products) {
      const itemType: CatalogItem["itemType"] =
        p.category === "MEDICATION"
          ? "MEDICATION"
          : p.category === "COURSE"
            ? "COURSE"
            : "PRODUCT";
      const attrs = (p.attributes ?? {}) as { price?: number };
      results.push({
        refId: p.id,
        code: p.sku,
        name: p.name,
        defaultPrice: attrs.price ?? 0,
        itemType,
        unit: p.unit ?? undefined,
        meta: { category: p.category, productId: p.id },
      });
    }
  }

  return results.slice(0, limit);
}
