import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/inventory/stock
 *   ?product_id=...    → ledger entries (latest first)
 *   (no product_id)    → balance per product (latest balance_after)
 */
export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "inventory",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    if (!ctx.branchId) throw new Error("branch required");

    const url = new URL(req.url);
    const productId = url.searchParams.get("product_id");
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));

    if (productId) {
      const entries = await prisma.stockLedger.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, productId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return NextResponse.json({ data: entries, correlation_id: ctx.correlationId });
    }

    // Aggregate: latest balance per product
    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, trackStock: true, deletedAt: null },
      select: { id: true, sku: true, name: true, category: true, unit: true, reorderLevel: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const balances = await Promise.all(
      products.map(async (p) => {
        const last = await prisma.stockLedger.findFirst({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId!, productId: p.id },
          orderBy: { createdAt: "desc" },
          select: { balanceAfter: true, createdAt: true },
        });
        return {
          ...p,
          balance: last?.balanceAfter.toString() ?? "0",
          lastMovementAt: last?.createdAt ?? null,
        };
      }),
    );
    return NextResponse.json({ data: balances, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
