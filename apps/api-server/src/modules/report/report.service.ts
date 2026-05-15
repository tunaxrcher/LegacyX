import { z } from "zod";
import { prisma, Prisma } from "@legacyx/db";
import { authorize } from "../../shared/auth";
import { BadRequest } from "../../shared/errors";
import type { RequestContext } from "../../shared/context";

/**
 * Phase S — Manager Reports.
 *
 * Five fixed reports the operator side has been asking for:
 *   1. Doctor productivity (visits + revenue per doctor, period)
 *   2. Service profitability (revenue − COGS per service, period)
 *   3. Patient retention (cohort: first visit month → return rate)
 *   4. Revenue trend (daily revenue + payment-method split)
 *   5. Inventory expiring (lots within `withinDays`, sorted by expiry)
 *
 * Each report is a pure read across already-existing tables — no
 * pre-aggregated tables, no event subscription. We can iterate later if any
 * of these become hot enough to need materialised views, but the MVP is fine
 * with on-demand SQL because the period dimension caps the row count.
 */

export const ReportPeriodDto = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const REPORT_PERMISSION = { resource: "report", action: "read" } as const;

function periodToRange(input: z.infer<typeof ReportPeriodDto>) {
  const from = new Date(`${input.from}T00:00:00.000Z`);
  const to = new Date(`${input.to}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw BadRequest("Invalid date range");
  }
  if (from > to) throw BadRequest("`from` must be on or before `to`");
  return { from, to };
}

/* ───────────────────────────── 1. Doctor productivity ───────────────────────────── */

export interface DoctorProductivityRow {
  doctorId: string;
  doctorName: string;
  visits: number;
  procedures: number;
  /** Sum of OrderItem.total for procedures performed by this doctor in window. */
  revenue: string;
}

export async function reportDoctorProductivity(
  ctx: RequestContext,
  input: z.infer<typeof ReportPeriodDto>,
): Promise<DoctorProductivityRow[]> {
  await authorize(ctx, REPORT_PERMISSION);
  const { from, to } = periodToRange(input);

  // Doctors are linked to encounters via `Procedure.performedBy` (the
  // schema doesn't carry a `doctorId` on Visit, the doctor is whoever
  // performed the procedure inside the visit). We therefore aggregate
  // procedures, then count distinct visits per doctor as the "visits" KPI.
  const procedures = await prisma.procedure.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? undefined,
      completedAt: { gte: from, lte: to },
      status: "COMPLETED",
      performedBy: { not: null },
    },
    select: {
      performedBy: true,
      procedureCode: true,
      order: {
        select: {
          visitId: true,
          items: {
            where: { itemType: "PROCEDURE" },
            select: { refId: true, total: true },
          },
        },
      },
    },
  });

  const byDoctor = new Map<
    string,
    {
      visits: Set<string>;
      procedures: number;
      revenue: Prisma.Decimal;
    }
  >();
  for (const p of procedures) {
    if (!p.performedBy) continue;
    const slot =
      byDoctor.get(p.performedBy) ??
      { visits: new Set<string>(), procedures: 0, revenue: new Prisma.Decimal(0) };
    slot.visits.add(p.order.visitId);
    slot.procedures += 1;
    const matched = p.order.items.find((i) => i.refId === p.procedureCode);
    if (matched) slot.revenue = slot.revenue.add(matched.total);
    byDoctor.set(p.performedBy, slot);
  }

  if (byDoctor.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...byDoctor.keys()] }, tenantId: ctx.tenantId },
    select: { id: true, fullName: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));

  return [...byDoctor.entries()]
    .map(([doctorId, s]) => ({
      doctorId,
      doctorName: nameOf.get(doctorId) ?? "(deleted user)",
      visits: s.visits.size,
      procedures: s.procedures,
      revenue: s.revenue.toString(),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

/* ───────────────────────────── 2. Service profitability ───────────────────────────── */

export interface ServiceProfitabilityRow {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  unitsSold: number;
  revenue: string;
  cogs: string;
  margin: string;
}

export async function reportServiceProfitability(
  ctx: RequestContext,
  input: z.infer<typeof ReportPeriodDto>,
): Promise<ServiceProfitabilityRow[]> {
  await authorize(ctx, REPORT_PERMISSION);
  const { from, to } = periodToRange(input);

  // Profitability = revenue − COGS. Revenue per service comes from
  // `procedures` joined to `services` (procedureCode = service.code).
  // COGS comes from procedure-driven inventory ledger rows (negative deltas).
  const procedures = await prisma.procedure.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? undefined,
      completedAt: { gte: from, lte: to },
      status: "COMPLETED",
    },
    select: {
      id: true,
      procedureCode: true,
      order: {
        select: {
          items: {
            where: { itemType: "PROCEDURE" },
            select: { refId: true, total: true },
          },
        },
      },
    },
  });

  const serviceCodes = [...new Set(procedures.map((p) => p.procedureCode))];
  // Service.procedureCode (not Service.code) is the link to procedure rows.
  const services = await prisma.service.findMany({
    where: { procedureCode: { in: serviceCodes }, tenantId: ctx.tenantId },
    select: { id: true, code: true, name: true, procedureCode: true },
  });
  const svcByCode = new Map(
    services
      .filter((s): s is typeof s & { procedureCode: string } => Boolean(s.procedureCode))
      .map((s) => [s.procedureCode, s]),
  );

  // Pull inventory adjustments for the same procedures, count COGS.
  const procIds = procedures.map((p) => p.id);
  const ledger = procIds.length
    ? await prisma.stockLedger.findMany({
        where: {
          tenantId: ctx.tenantId,
          refType: "PROCEDURE",
          refId: { in: procIds },
        },
        select: { refId: true, qty: true, unitCost: true },
      })
    : [];
  const cogsByProcedure = new Map<string, Prisma.Decimal>();
  for (const l of ledger) {
    if (!l.refId) continue;
    const cost = (l.unitCost ?? new Prisma.Decimal(0)).mul(l.qty.abs());
    const prev = cogsByProcedure.get(l.refId) ?? new Prisma.Decimal(0);
    cogsByProcedure.set(l.refId, prev.add(cost));
  }

  const aggregated = new Map<
    string,
    { code: string; name: string; units: number; revenue: Prisma.Decimal; cogs: Prisma.Decimal }
  >();
  for (const proc of procedures) {
    const svc = svcByCode.get(proc.procedureCode);
    if (!svc) continue;
    const matchedItem = proc.order.items.find((i) => i.refId === proc.procedureCode);
    const revenue = matchedItem?.total ?? new Prisma.Decimal(0);
    const cogs = cogsByProcedure.get(proc.id) ?? new Prisma.Decimal(0);

    const slot = aggregated.get(svc.id) ?? {
      code: svc.code,
      name: svc.name,
      units: 0,
      revenue: new Prisma.Decimal(0),
      cogs: new Prisma.Decimal(0),
    };
    slot.units += 1;
    slot.revenue = slot.revenue.add(revenue);
    slot.cogs = slot.cogs.add(cogs);
    aggregated.set(svc.id, slot);
  }

  return [...aggregated.entries()]
    .map(([serviceId, s]) => ({
      serviceId,
      serviceCode: s.code,
      serviceName: s.name,
      unitsSold: s.units,
      revenue: s.revenue.toString(),
      cogs: s.cogs.toString(),
      margin: s.revenue.sub(s.cogs).toString(),
    }))
    .sort((a, b) => Number(b.margin) - Number(a.margin));
}

/* ───────────────────────────── 3. Patient retention ───────────────────────────── */

export interface RetentionCohortRow {
  cohortMonth: string; // YYYY-MM
  newPatients: number;
  /** cumulative number of patients in this cohort with at least N visits */
  returnedAtLeastOnce: number;
  returnedAtLeastTwice: number;
  returnedAtLeastFiveTimes: number;
}

export async function reportPatientRetention(
  ctx: RequestContext,
  input: z.infer<typeof ReportPeriodDto>,
): Promise<RetentionCohortRow[]> {
  await authorize(ctx, REPORT_PERMISSION);
  const { from, to } = periodToRange(input);

  // Patients whose FIRST visit landed inside the window form the cohort
  // anchor. We count subsequent visits (any time, lifetime) for retention.
  const cohortVisits = await prisma.visit.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? undefined,
      checkedInAt: { gte: from, lte: to },
    },
    select: { patientId: true, checkedInAt: true },
    orderBy: { checkedInAt: "asc" },
  });

  // Group: first-visit-month per patient (within the window).
  const firstByPatient = new Map<string, Date>();
  for (const v of cohortVisits) {
    if (!v.checkedInAt) continue;
    if (!firstByPatient.has(v.patientId)) {
      firstByPatient.set(v.patientId, v.checkedInAt);
    }
  }
  if (firstByPatient.size === 0) return [];

  const allVisits = await prisma.visit.findMany({
    where: {
      tenantId: ctx.tenantId,
      patientId: { in: [...firstByPatient.keys()] },
    },
    select: { patientId: true },
  });
  const visitCount = new Map<string, number>();
  for (const v of allVisits) {
    visitCount.set(v.patientId, (visitCount.get(v.patientId) ?? 0) + 1);
  }

  const cohorts = new Map<string, RetentionCohortRow>();
  for (const [patientId, first] of firstByPatient) {
    const month = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
    const slot =
      cohorts.get(month) ??
      ({
        cohortMonth: month,
        newPatients: 0,
        returnedAtLeastOnce: 0,
        returnedAtLeastTwice: 0,
        returnedAtLeastFiveTimes: 0,
      } satisfies RetentionCohortRow);
    slot.newPatients += 1;
    const v = visitCount.get(patientId) ?? 0;
    if (v >= 2) slot.returnedAtLeastOnce += 1;
    if (v >= 3) slot.returnedAtLeastTwice += 1;
    if (v >= 6) slot.returnedAtLeastFiveTimes += 1;
    cohorts.set(month, slot);
  }

  return [...cohorts.values()].sort((a, b) =>
    a.cohortMonth.localeCompare(b.cohortMonth),
  );
}

/* ───────────────────────────── 4. Revenue trend ───────────────────────────── */

export interface RevenueTrendRow {
  date: string; // YYYY-MM-DD
  total: string;
  cash: string;
  card: string;
  qr: string;
  transfer: string;
  wallet: string;
  other: string;
}

export async function reportRevenueTrend(
  ctx: RequestContext,
  input: z.infer<typeof ReportPeriodDto>,
): Promise<RevenueTrendRow[]> {
  await authorize(ctx, REPORT_PERMISSION);
  const { from, to } = periodToRange(input);

  const payments = await prisma.payment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? undefined,
      completedAt: { gte: from, lte: to },
      state: { in: ["COMPLETED", "SETTLED"] },
    },
    select: { amount: true, method: true, completedAt: true },
  });

  const map = new Map<string, RevenueTrendRow>();
  for (const p of payments) {
    if (!p.completedAt) continue;
    const d = `${p.completedAt.getUTCFullYear()}-${String(
      p.completedAt.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(p.completedAt.getUTCDate()).padStart(2, "0")}`;
    const slot =
      map.get(d) ??
      ({
        date: d,
        total: "0",
        cash: "0",
        card: "0",
        qr: "0",
        transfer: "0",
        wallet: "0",
        other: "0",
      } satisfies RevenueTrendRow);
    const add = (k: keyof RevenueTrendRow, v: Prisma.Decimal) => {
      slot[k] = new Prisma.Decimal(slot[k] as string).add(v).toString();
    };
    add("total", p.amount);
    switch (p.method) {
      case "CASH":
        add("cash", p.amount);
        break;
      case "CARD":
        add("card", p.amount);
        break;
      case "QR_PROMPTPAY":
        add("qr", p.amount);
        break;
      case "TRANSFER":
        add("transfer", p.amount);
        break;
      case "WALLET":
        add("wallet", p.amount);
        break;
      default:
        add("other", p.amount);
    }
    map.set(d, slot);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ───────────────────────────── 5. Inventory expiring ───────────────────────────── */

export const ExpiringQueryDto = z.object({
  withinDays: z.coerce.number().int().min(1).max(365).default(30),
});

export interface ExpiringRow {
  productId: string;
  sku: string;
  name: string;
  lotNo: string | null;
  quantityOnHand: string;
  expiresAt: string;
  daysUntilExpiry: number;
}

export async function reportInventoryExpiring(
  ctx: RequestContext,
  input: z.infer<typeof ExpiringQueryDto>,
): Promise<ExpiringRow[]> {
  await authorize(ctx, REPORT_PERMISSION);
  const now = new Date();
  const horizon = new Date(now.getTime() + input.withinDays * 86_400_000);

  // Two-step: pull lots with expiry inside the horizon, THEN compute the
  // current balance per (product, lot) by summing the ledger. We keep that in
  // app code because the schema doesn't have a "stock_lot" table — lot is
  // a column on the ledger row that received it.
  const ledger = await prisma.stockLedger.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? undefined,
      lotNo: { not: null },
      expiresAt: { not: null, lte: horizon },
    },
    select: {
      productId: true,
      lotNo: true,
      qty: true,
      expiresAt: true,
    },
  });

  const productIds = [...new Set(ledger.map((l) => l.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId: ctx.tenantId },
        select: { id: true, sku: true, name: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  type Key = string;
  const balance = new Map<
    Key,
    {
      productId: string;
      sku: string;
      name: string;
      lotNo: string | null;
      qty: Prisma.Decimal;
      expiresAt: Date;
    }
  >();
  for (const l of ledger) {
    if (!l.expiresAt) continue;
    const product = productById.get(l.productId);
    const k: Key = `${l.productId}|${l.lotNo ?? ""}`;
    const slot = balance.get(k) ?? {
      productId: l.productId,
      sku: product?.sku ?? "?",
      name: product?.name ?? "?",
      lotNo: l.lotNo,
      qty: new Prisma.Decimal(0),
      expiresAt: l.expiresAt,
    };
    slot.qty = slot.qty.add(l.qty);
    balance.set(k, slot);
  }

  return [...balance.values()]
    .filter((s) => s.qty.gt(0))
    .map((s) => {
      const days = Math.ceil(
        (s.expiresAt.getTime() - now.getTime()) / 86_400_000,
      );
      return {
        productId: s.productId,
        sku: s.sku,
        name: s.name,
        lotNo: s.lotNo,
        quantityOnHand: s.qty.toString(),
        expiresAt: s.expiresAt.toISOString(),
        daysUntilExpiry: days,
      };
    })
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}
