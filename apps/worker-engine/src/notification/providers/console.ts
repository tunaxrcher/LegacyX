import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { logger } from "../../logger";
import type { NotificationProvider } from "./types";

const log = logger.child({ provider: "console" });

const OUTBOX_DIR = process.env.NOTIFICATION_OUTBOX_DIR
  ? resolve(process.env.NOTIFICATION_OUTBOX_DIR)
  : resolve(process.cwd(), "storage", "notifications");

function appendLog(line: string, file: string) {
  try {
    const target = resolve(OUTBOX_DIR, file);
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, line + "\n", "utf8");
  } catch (err) {
    log.warn({ err }, "console provider: failed to append outbox file");
  }
}

/**
 * Console provider — the default in dev / demo. Writes a JSON line to
 * `storage/notifications/{channel}.log` so QA can verify deliveries without
 * paying for real LINE/SMS/Email.
 *
 * Toggle the real provider per channel via env:
 *   NOTIFICATION_LINE_PROVIDER=line-messaging-api
 *   NOTIFICATION_SMS_PROVIDER=twilio
 *   NOTIFICATION_EMAIL_PROVIDER=sendgrid
 * (all default to "console" today).
 */
export function makeConsoleProvider(channel: "LINE" | "SMS" | "EMAIL"): NotificationProvider {
  return {
    name: "console",
    channel,
    async send(recipient, message) {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        channel,
        recipient,
        message,
      });
      appendLog(line, `${channel.toLowerCase()}.log`);
      log.info(
        { channel, recipient: recipient.ref, title: message.title },
        "[console-send] notification dispatched",
      );
      return { ok: true, providerRef: `console:${Date.now()}` };
    },
  };
}
