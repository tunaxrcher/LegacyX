import { prisma } from "@legacyx/db";
import { logger } from "../logger";
import { cronRuns, cronEnqueued } from "../metrics";

const log = logger.child({ component: "crm-cron" });

/**
 * Phase 8 CRM cron jobs.
 *
 * Each job is idempotent — it scans the database for entities that match a
 * criteria, then inserts a `NotificationLog` row only if one hasn't already
 * been queued for the same `(template, recipient, day)` window. The
 * notification dispatcher (separate tick) is what actually sends them.
 *
 * Jobs are deliberately read-mostly + DB-driven so we don't need an external
 * scheduler (Quartz / cron daemon). The worker loop calls `runCrmCron()` on a
 * fixed interval and we use the DB as the source of truth for "have I sent
 * this yet?".
 */

/** How often the CRM cron tick fires. Default 1 hour. */
export const CRM_CRON_TICK_MS = Number(
  process.env.CRM_CRON_TICK_MS ?? 60 * 60 * 1000,
);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Enqueue a notification only if no row with same `(template, recipient)` has
 * been created within `windowDays`. Returns `true` if a new row was created.
 */
async function enqueueIfNew(opts: {
  tenantId: string;
  branchId?: string | null;
  channel: "LINE" | "SMS" | "EMAIL";
  templateCode: string;
  recipientRef: string;
  payload: Record<string, unknown>;
  windowDays?: number;
}): Promise<boolean> {
  const windowDays = opts.windowDays ?? 7;
  const cutoff = new Date(Date.now() - windowDays * 86_400_000);
  const existing = await prisma.notificationLog.findFirst({
    where: {
      tenantId: opts.tenantId,
      templateCode: opts.templateCode,
      recipientRef: opts.recipientRef,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.notificationLog.create({
    data: {
      tenantId: opts.tenantId,
      branchId: opts.branchId ?? null,
      channel: opts.channel,
      templateCode: opts.templateCode,
      recipientRef: opts.recipientRef,
      payload: opts.payload as object,
      status: "PENDING",
    },
  });
  return true;
}

function patientHasChannel(
  patient: { lineUserId: string | null; phoneEnc: string | null; emailEnc: string | null },
): "LINE" | "SMS" | "EMAIL" | null {
  if (patient.lineUserId) return "LINE";
  if (patient.emailEnc) return "EMAIL";
  if (patient.phoneEnc) return "SMS";
  return null;
}

// ============================================================================
// Job 1 — Review request D+3
// ============================================================================
/**
 * For each `Visit` completed exactly 3 days ago (within a 24h window), enqueue
 * a `review.request` LINE/SMS/EMAIL message — but only if we haven't already
 * sent one for the same patient in the past 30 days.
 */
async function jobReviewRequestD3(): Promise<number> {
  const now = Date.now();
  const start = new Date(now - 4 * 86_400_000);
  const end = new Date(now - 3 * 86_400_000);

  const visits = await prisma.visit.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: start, lt: end },
    },
    take: 200,
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      patientId: true,
      completedAt: true,
      patient: {
        select: {
          id: true,
          lineUserId: true,
          phoneEnc: true,
          emailEnc: true,
        },
      },
    },
  });
  let enqueued = 0;
  for (const v of visits) {
    const channel = patientHasChannel(v.patient);
    if (!channel) continue;
    const ok = await enqueueIfNew({
      tenantId: v.tenantId,
      branchId: v.branchId,
      channel,
      templateCode: "review.request",
      recipientRef: v.patientId,
      payload: { visit_id: v.id, completed_at: v.completedAt?.toISOString() },
      windowDays: 30,
    });
    if (ok) enqueued++;
  }
  return enqueued;
}

// ============================================================================
// Job 2 — Rebooking reminder (last visit >= 30 days, no upcoming appointment)
// ============================================================================
async function jobRebookingReminder(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);

  // Patients with a completed visit older than 30 days that haven't been
  // tagged with a more recent visit. Implementation: load patients with a
  // completed visit in [cutoff - 7d, cutoff], then verify they have no
  // upcoming appointment.
  const start = new Date(cutoff.getTime() - 7 * 86_400_000);
  const end = cutoff;
  const visits = await prisma.visit.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: start, lt: end },
    },
    take: 500,
    distinct: ["patientId"],
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      patientId: true,
      completedAt: true,
      patient: {
        select: {
          id: true,
          lineUserId: true,
          phoneEnc: true,
          emailEnc: true,
        },
      },
    },
  });

  let enqueued = 0;
  for (const v of visits) {
    // Skip if the patient already has an upcoming appointment.
    const upcoming = await prisma.appointment.findFirst({
      where: {
        tenantId: v.tenantId,
        patientId: v.patientId,
        scheduledAt: { gt: new Date() },
        status: { in: ["BOOKED", "CONFIRMED", "CHECKED_IN"] },
      },
      select: { id: true },
    });
    if (upcoming) continue;

    const channel = patientHasChannel(v.patient);
    if (!channel) continue;
    const ok = await enqueueIfNew({
      tenantId: v.tenantId,
      branchId: v.branchId,
      channel,
      templateCode: "rebooking.reminder",
      recipientRef: v.patientId,
      payload: { last_visit_id: v.id, days_since: 30 },
      windowDays: 30,
    });
    if (ok) enqueued++;
  }
  return enqueued;
}

// ============================================================================
// Job 3 — Wallet expiring (course balance > 0 and expires_at within 14 days)
// ============================================================================
async function jobWalletExpiring(): Promise<number> {
  const horizon = new Date(Date.now() + 14 * 86_400_000);
  const now = new Date();

  const accounts = await prisma.walletAccount.findMany({
    where: {
      balance: { gt: 0 },
      expiresAt: { gte: now, lte: horizon },
    },
    take: 500,
    select: {
      id: true,
      tenantId: true,
      patientId: true,
      productId: true,
      balance: true,
      expiresAt: true,
    },
  });

  if (accounts.length === 0) return 0;

  const productIds = accounts.map((a) => a.productId);
  const patientIds = accounts.map((a) => a.patientId);
  const [products, patients] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    }),
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: {
        id: true,
        lineUserId: true,
        phoneEnc: true,
        emailEnc: true,
      },
    }),
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  let enqueued = 0;
  for (const a of accounts) {
    const daysLeft = Math.max(
      0,
      Math.ceil((a.expiresAt!.getTime() - now.getTime()) / 86_400_000),
    );
    const p = patientMap.get(a.patientId);
    if (!p) continue;
    const channel = patientHasChannel(p);
    if (!channel) continue;
    const ok = await enqueueIfNew({
      tenantId: a.tenantId,
      channel,
      templateCode: "wallet.expiring",
      recipientRef: a.patientId,
      payload: {
        wallet_id: a.id,
        product_name: productMap.get(a.productId)?.name ?? "course",
        balance: a.balance,
        days_left: daysLeft,
      },
      windowDays: 14,
    });
    if (ok) enqueued++;
  }
  return enqueued;
}

// ============================================================================
// Job 4 — Birthday bonus (today is patient's birthday)
// ============================================================================
async function jobBirthdayBonus(): Promise<number> {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  // No SQL-portable birthday MM-DD comparison, so fetch a bounded set and
  // filter in app code. For a real prod scale-out, we'd add a generated
  // column `birthday_md` (smallint) and index it.
  const patients = await prisma.patient.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      dob: { not: null },
    },
    take: 2000,
    select: {
      id: true,
      firstName: true,
      tenantId: true,
      homeBranchId: true,
      dob: true,
      lineUserId: true,
      phoneEnc: true,
      emailEnc: true,
    },
  });

  let enqueued = 0;
  for (const p of patients) {
    if (!p.dob) continue;
    if (p.dob.getMonth() + 1 !== month || p.dob.getDate() !== day) continue;
    const channel = patientHasChannel(p);
    if (!channel) continue;
    const ok = await enqueueIfNew({
      tenantId: p.tenantId,
      branchId: p.homeBranchId,
      channel,
      templateCode: "birthday.bonus",
      recipientRef: p.id,
      payload: {
        first_name: p.firstName,
        year: today.getFullYear(),
      },
      windowDays: 300, // once per year
    });
    if (ok) enqueued++;
  }
  return enqueued;
}

// ============================================================================
// Orchestrator
// ============================================================================
async function runJob(name: string, fn: () => Promise<number>): Promise<number> {
  try {
    const n = await fn();
    cronRuns.inc({ job: name, outcome: "ok" });
    cronEnqueued.inc({ job: name }, n);
    return n;
  } catch (err) {
    cronRuns.inc({ job: name, outcome: "failed" });
    log.error({ err, job: name }, "cron job failed");
    return 0;
  }
}

export async function runCrmCron(): Promise<{
  review: number;
  rebooking: number;
  wallet: number;
  birthday: number;
}> {
  log.info({}, "CRM cron tick");
  const [review, rebooking, wallet, birthday] = await Promise.all([
    runJob("review", jobReviewRequestD3),
    runJob("rebooking", jobRebookingReminder),
    runJob("wallet", jobWalletExpiring),
    runJob("birthday", jobBirthdayBonus),
  ]);
  log.info({ review, rebooking, wallet, birthday }, "CRM cron done");
  return { review, rebooking, wallet, birthday };
}
