import { prisma } from "@legacyx/db";
import { logger } from "../logger";
import { cronRuns, cronEnqueued } from "../metrics";

const log = logger.child({ component: "appointment-reminder" });

/**
 * Phase 8.2 — Appointment reminder cron.
 *
 * Scans `Appointment` rows whose `scheduledAt` falls inside one of the
 * configured offset windows ahead of `NOW`, and enqueues a `NotificationLog`
 * row using template `appointment.reminder`. The dispatcher (separate 5s
 * tick) is what actually sends the LINE/SMS/Email.
 *
 * Idempotency: we never insert a second reminder row for the same
 * (appointment_id, minutes_before) tuple — we look it up via JSON path
 * filter on `payload.appointment_id`. Multiple reminders at different
 * offsets ARE supported (e.g. 24h + 1h + 15min) by giving each offset its
 * own `minutes_before` payload key.
 *
 * Why DB-scan and not BullMQ delayed jobs?
 *   - Appointments get rescheduled / cancelled. A delayed BullMQ job has no
 *     way to "un-schedule" itself; we'd have to track the job id per
 *     appointment + cancel it on every mutation. DB-scan handles that
 *     intrinsically: cancel → no row → no reminder.
 *   - Same tradeoff as `crm-cron.ts` makes for review/rebooking.
 */

/** How often the reminder cron tick fires. Default 1 minute. */
export const REMINDER_TICK_MS = Number(
  process.env.APPOINTMENT_REMINDER_TICK_MS ?? 60_000,
);

/**
 * Comma-separated list of minutes-before-appointment to fire reminders.
 * Default: `"15"`. Examples:
 *   - `"15"`           → only the 15-min reminder
 *   - `"1440,60,15"`   → 1 day + 1 hour + 15 minutes
 */
function parseOffsets(): number[] {
  const raw = process.env.APPOINTMENT_REMINDER_OFFSETS_MIN ?? "15";
  const out = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n));
  return out.length > 0 ? out : [15];
}

const APPOINTMENT_STATUSES_DUE = ["BOOKED", "CONFIRMED"] as const;

type CandidateAppt = {
  id: string;
  tenantId: string;
  branchId: string;
  patientId: string;
  scheduledAt: Date;
};

async function scanWindow(offsetMin: number): Promise<CandidateAppt[]> {
  // The window is `[NOW + offset - half-tick, NOW + offset + half-tick]` so
  // that with a tick interval of T ms we catch every appointment at least
  // once and at most twice (deduped by JSON filter below). Pad by 30s
  // safety margin to absorb scheduler jitter.
  const halfTickMs = Math.max(REMINDER_TICK_MS / 2, 30_000);
  const center = Date.now() + offsetMin * 60_000;
  const from = new Date(center - halfTickMs);
  const to = new Date(center + halfTickMs);

  return prisma.appointment.findMany({
    where: {
      status: { in: APPOINTMENT_STATUSES_DUE as unknown as Array<"BOOKED" | "CONFIRMED"> },
      scheduledAt: { gte: from, lte: to },
    },
    take: 500,
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      patientId: true,
      scheduledAt: true,
    },
  });
}

async function alreadyEnqueued(
  appointmentId: string,
  offsetMin: number,
): Promise<boolean> {
  // JSON path filter on MySQL — `path` is a JSONPath string (PostgreSQL
  // uses string[], but our Prisma datasource is MySQL).
  //   WHERE JSON_EXTRACT(payload,'$.appointment_id') = appointmentId
  //     AND JSON_EXTRACT(payload,'$.minutes_before') = offsetMin
  const existing = await prisma.notificationLog.findFirst({
    where: {
      templateCode: "appointment.reminder",
      AND: [
        {
          payload: {
            path: "$.appointment_id",
            equals: appointmentId,
          },
        },
        {
          payload: {
            path: "$.minutes_before",
            equals: offsetMin,
          },
        },
      ],
    },
    select: { id: true },
  });
  return !!existing;
}

async function enqueueReminderFor(
  a: CandidateAppt,
  offsetMin: number,
): Promise<boolean> {
  if (await alreadyEnqueued(a.id, offsetMin)) return false;

  // Confirm patient still has a LINE binding + opt-in (avoid PENDING rows
  // that the dispatcher will fail-permanent on).
  const patient = await prisma.patient.findFirst({
    where: { id: a.patientId, tenantId: a.tenantId, deletedAt: null },
    select: {
      id: true,
      lineUserId: true,
      lineNotificationsOptIn: true,
      phoneEnc: true,
      emailEnc: true,
    },
  });
  if (!patient) return false;

  let channel: "LINE" | "SMS" | "EMAIL" | null = null;
  if (patient.lineUserId && patient.lineNotificationsOptIn !== false) {
    channel = "LINE";
  } else if (patient.emailEnc) {
    channel = "EMAIL";
  } else if (patient.phoneEnc) {
    channel = "SMS";
  }
  if (!channel) return false;

  // Best-effort branch name for the message body.
  const branch = await prisma.branch.findFirst({
    where: { id: a.branchId, tenantId: a.tenantId },
    select: { name: true },
  });

  await prisma.notificationLog.create({
    data: {
      tenantId: a.tenantId,
      branchId: a.branchId,
      channel,
      templateCode: "appointment.reminder",
      recipientRef: a.patientId,
      payload: {
        appointment_id: a.id,
        scheduled_at: a.scheduledAt.toISOString(),
        minutes_before: offsetMin,
        branch_name: branch?.name ?? null,
        locale: "th",
      },
      status: "PENDING",
    },
  });
  return true;
}

async function runForOffset(offsetMin: number): Promise<number> {
  const candidates = await scanWindow(offsetMin);
  if (candidates.length === 0) return 0;
  let enqueued = 0;
  for (const a of candidates) {
    try {
      const ok = await enqueueReminderFor(a, offsetMin);
      if (ok) enqueued++;
    } catch (err) {
      log.warn(
        { err, appt: a.id, offsetMin },
        "enqueueReminderFor failed; continuing",
      );
    }
  }
  return enqueued;
}

export async function runAppointmentReminderTick(): Promise<{
  byOffset: Record<number, number>;
  total: number;
}> {
  const offsets = parseOffsets();
  const byOffset: Record<number, number> = {};
  let total = 0;
  for (const off of offsets) {
    const job = `appointment.reminder.${off}m`;
    try {
      const n = await runForOffset(off);
      byOffset[off] = n;
      total += n;
      cronRuns.inc({ job, outcome: "ok" });
      if (n > 0) cronEnqueued.inc({ job }, n);
    } catch (err) {
      log.error({ err, offsetMin: off }, "reminder offset failed");
      cronRuns.inc({ job, outcome: "failed" });
      byOffset[off] = 0;
    }
  }
  if (total > 0) {
    log.info({ byOffset, total }, "appointment reminders enqueued");
  } else {
    log.debug({ offsets }, "no reminders due this tick");
  }
  return { byOffset, total };
}
