import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";

export const dynamic = "force-dynamic";

/**
 * Manager Strategic Dashboard data feed. Requires `audit:read:tenant` (Manager
 * or Admin). Returns aggregated KPIs scoped to the active tenant + branch.
 */
export async function GET(_req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, { resource: "audit", action: "read", target: {} });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // last 7 days incl. today
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const branchFilter = ctx.branchId ? { branchId: ctx.branchId } : {};

    // Revenue (paid invoices)
    const [revenueToday, revenueMtd, paidInvoicesWeek, visitsToday, aiPending, lowStock, branches] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: {
            tenantId: ctx.tenantId,
            ...branchFilter,
            status: "PAID",
            createdAt: { gte: startOfToday },
          },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.invoice.aggregate({
          where: {
            tenantId: ctx.tenantId,
            ...branchFilter,
            status: "PAID",
            createdAt: { gte: startOfMonth },
          },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.invoice.findMany({
          where: {
            tenantId: ctx.tenantId,
            ...branchFilter,
            status: "PAID",
            createdAt: { gte: startOfWeek },
          },
          select: { total: true, createdAt: true, branchId: true },
        }),
        prisma.visit.count({
          where: {
            tenantId: ctx.tenantId,
            ...branchFilter,
            checkedInAt: { gte: startOfToday },
          },
        }),
        prisma.aIDraft.count({
          where: { tenantId: ctx.tenantId, status: "PENDING" },
        }),
        prisma.product.findMany({
          where: { tenantId: ctx.tenantId, trackStock: true, deletedAt: null },
          select: { id: true, sku: true, name: true, reorderLevel: true },
        }),
        prisma.branch.findMany({
          where: { tenantId: ctx.tenantId, deletedAt: null },
          select: { id: true, code: true, name: true },
        }),
      ]);

    // Bucket weekly revenue by day (7 buckets)
    const dailyBuckets: { date: string; total: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const total = paidInvoicesWeek
        .filter((inv) => inv.createdAt >= d && inv.createdAt < next)
        .reduce((s, inv) => s + Number(inv.total), 0);
      dailyBuckets.push({ date: d.toISOString().slice(0, 10), total });
    }

    // Branch comparison (MTD revenue)
    const branchRevenue = await prisma.invoice.groupBy({
      by: ["branchId"],
      where: {
        tenantId: ctx.tenantId,
        status: "PAID",
        createdAt: { gte: startOfMonth },
      },
      _sum: { total: true },
      _count: { _all: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b]));
    const branchStats = branchRevenue.map((r) => ({
      branchId: r.branchId,
      code: branchMap.get(r.branchId)?.code ?? r.branchId.slice(-6),
      name: branchMap.get(r.branchId)?.name ?? "—",
      revenue: Number(r._sum.total ?? 0),
      invoiceCount: r._count._all,
    }));

    // Low stock items: need current balance vs reorderLevel.
    // Use Prisma groupBy + orderBy on createdAt to get latest ledger row per
    // (product, branch) without raw SQL. We fetch the last 1 row per group via
    // findMany + distinct (MySQL supports DISTINCT ON via Prisma's `distinct`).
    const lowStockIds = lowStock.map((p) => p.id);
    const lastLedger = lowStockIds.length
      ? await prisma.stockLedger.findMany({
          where: {
            tenantId: ctx.tenantId,
            productId: { in: lowStockIds },
            ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
          },
          orderBy: { createdAt: "desc" },
          distinct: ["productId", "branchId"],
          select: { productId: true, branchId: true, balanceAfter: true },
        })
      : [];
    const balanceByProduct = new Map<string, number>();
    for (const r of lastLedger) {
      balanceByProduct.set(
        r.productId,
        (balanceByProduct.get(r.productId) ?? 0) + Number(r.balanceAfter),
      );
    }
    const lowStockAlerts = lowStock
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        balance: balanceByProduct.get(p.id) ?? 0,
        reorderLevel: p.reorderLevel,
      }))
      .filter((p) => p.reorderLevel > 0 && p.balance <= p.reorderLevel)
      .sort((a, b) => a.balance / Math.max(1, a.reorderLevel) - b.balance / Math.max(1, b.reorderLevel));

    return NextResponse.json({
      data: {
        kpis: {
          revenueToday: Number(revenueToday._sum.total ?? 0),
          revenueTodayCount: revenueToday._count._all,
          revenueMtd: Number(revenueMtd._sum.total ?? 0),
          revenueMtdCount: revenueMtd._count._all,
          visitsToday,
          aiPending,
          lowStockCount: lowStockAlerts.length,
        },
        dailyRevenue: dailyBuckets,
        branchStats,
        lowStockAlerts: lowStockAlerts.slice(0, 10),
      },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
