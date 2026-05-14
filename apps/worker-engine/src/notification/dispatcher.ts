import { prisma } from "@legacyx/db";
import { logger } from "../logger";
import { providers } from "./providers";
import type { NotificationProvider, ProviderRecipient } from "./providers/types";
import { renderTemplate, type TemplateLocale } from "./templates";
import { notificationsSent } from "../metrics";

const log = logger.child({ component: "notification-dispatcher" });

/** Max attempts before we give up and mark the row FAILED. */
const MAX_ATTEMPTS = Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? 4);
/** Batch size per tick. */
const BATCH_SIZE = Number(process.env.NOTIFICATION_BATCH_SIZE ?? 25);

/** How often the dispatcher tick fires. */
export const NOTIFICATION_TICK_MS = Number(
  process.env.NOTIFICATION_TICK_MS ?? 5_000,
);

/**
 * Resolve a recipient_ref into a channel-specific identifier.
 *
 * For LINE we look up the patient's `lineUserId`. For SMS/EMAIL we decrypt the
 * patient's phone/email. The `recipient_ref` field on `NotificationLog` is
 * usually the patient.id (set by upstream handlers); callers can also set it
 * to a raw identifier (already-formatted phone/email) — we honour that as-is.
 *
 * Special distribution-list values:
 *   - `"manager"` — fans out to every active user with the MANAGER role in the
 *     tenant. We pick the first one's email/phone as a v1 placeholder.
 */
async function resolveRecipient(
  channel: "LINE" | "SMS" | "EMAIL",
  recipientRef: string,
  tenantId: string,
): Promise<ProviderRecipient | null> {
  if (recipientRef === "manager") {
    return resolveDistributionList("MANAGER", tenantId, channel);
  }
  // Heuristic: if it looks like a raw email/phone/LINE user id, return as-is.
  if (channel === "EMAIL" && recipientRef.includes("@")) {
    return { ref: recipientRef };
  }
  if (channel === "SMS" && /^\+?\d{8,15}$/.test(recipientRef)) {
    return { ref: recipientRef };
  }
  if (channel === "LINE" && recipientRef.startsWith("U")) {
    return { ref: recipientRef };
  }

  // Otherwise treat as patient.id and look up.
  const patient = await prisma.patient.findFirst({
    where: { id: recipientRef, tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      lineUserId: true,
      phoneEnc: true,
      emailEnc: true,
    },
  });
  if (!patient) return null;
  const name = `${patient.firstName} ${patient.lastName}`.trim();

  if (channel === "LINE") {
    if (!patient.lineUserId) return null;
    return { ref: patient.lineUserId, name };
  }
  if (channel === "SMS") {
    if (!patient.phoneEnc) return null;
    const { decryptField } = await import("./crypto-shim");
    try {
      return { ref: decryptField(patient.phoneEnc), name };
    } catch {
      return null;
    }
  }
  if (channel === "EMAIL") {
    if (!patient.emailEnc) return null;
    const { decryptField } = await import("./crypto-shim");
    try {
      return { ref: decryptField(patient.emailEnc), name };
    } catch {
      return null;
    }
  }
  return null;
}

function pickLocale(payload: Record<string, unknown>): TemplateLocale {
  const l = (payload?.locale as string | undefined)?.toLowerCase();
  return l === "en" ? "en" : "th";
}

async function resolveDistributionList(
  roleCode: string,
  tenantId: string,
  channel: "LINE" | "SMS" | "EMAIL",
): Promise<ProviderRecipient | null> {
  const role = await prisma.role.findFirst({
    where: { tenantId, code: roleCode },
    select: { id: true },
  });
  if (!role) return null;
  const userRoles = await prisma.userRole.findMany({
    where: { roleId: role.id },
    select: { userId: true },
    take: 50,
  });
  if (userRoles.length === 0) return null;
  const userIds = userRoles.map((r) => r.userId);
  const user = await prisma.user.findFirst({
    where: { id: { in: userIds }, status: "ACTIVE" },
    select: { id: true, email: true, fullName: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) return null;
  if (channel === "EMAIL") {
    return { ref: user.email, name: user.fullName };
  }
  // LINE/SMS for managers isn't wired in v1 — fall through to console provider
  // by returning the email as a stand-in (logged but never sent over real LINE
  // since we don't know the manager's LINE id).
  return { ref: user.email, name: user.fullName };
}

async function processOne(rowId: string) {
  const row = await prisma.notificationLog.findUnique({ where: { id: rowId } });
  if (!row) return;
  if (row.status !== "PENDING") return;
  if (row.attempt >= MAX_ATTEMPTS) {
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: { status: "FAILED", lastError: "Max attempts exceeded" },
    });
    return;
  }
  if (row.channel === "PUSH" || row.channel === "IN_APP") {
    // We don't dispatch these synchronously yet; mark as SENT so they stop
    // looping. The patient app reads IN_APP rows directly via its own API
    // when we implement an in-app feed.
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date() },
    });
    return;
  }

  const channel = row.channel as "LINE" | "SMS" | "EMAIL";
  const provider: NotificationProvider = providers[channel];
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const recipient = await resolveRecipient(channel, row.recipientRef, row.tenantId);
  if (!recipient) {
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        lastError: `Could not resolve ${channel} recipient for ${row.recipientRef}`,
        attempt: { increment: 1 },
      },
    });
    return;
  }

  const message = renderTemplate(row.templateCode, payload, pickLocale(payload));
  const result = await provider.send(recipient, message);

  if (result.ok) {
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        providerRef: result.providerRef,
        sentAt: new Date(),
        deliveredAt: new Date(),
        attempt: { increment: 1 },
      },
    });
    notificationsSent.inc({ channel, status: "sent" });
    log.info(
      { row: row.id, channel, template: row.templateCode },
      "notification sent",
    );
  } else if (result.retryable && row.attempt + 1 < MAX_ATTEMPTS) {
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: {
        attempt: { increment: 1 },
        lastError: result.error.slice(0, 1000),
      },
    });
    log.warn(
      { row: row.id, channel, attempt: row.attempt + 1, err: result.error },
      "transient failure — will retry",
    );
  } else {
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        attempt: { increment: 1 },
        lastError: result.error.slice(0, 1000),
      },
    });
    notificationsSent.inc({ channel, status: "failed" });
    log.error(
      { row: row.id, channel, err: result.error },
      "notification permanently failed",
    );
  }
}

/** One tick: pull a small batch of PENDING rows and dispatch them sequentially. */
export async function dispatchTick() {
  const rows = await prisma.notificationLog.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });
  if (rows.length === 0) return;
  log.debug({ batch: rows.length }, "dispatch tick");
  for (const r of rows) {
    try {
      await processOne(r.id);
    } catch (err) {
      log.error({ err, row: r.id }, "dispatch threw");
    }
  }
}
