import { logger } from "../../logger";
import type { NotificationProvider, SendResult } from "./types";

const log = logger.child({ provider: "email" });

/**
 * Email provider — SendGrid v3.
 *
 * Real call:
 *   POST https://api.sendgrid.com/v3/mail/send
 * with JSON body `{ personalizations, from, subject, content[] }`.
 *
 * Required env:
 *   SENDGRID_API_KEY
 *   EMAIL_FROM     — e.g. "no-reply@legacyx.example"
 */
export const emailSendgridProvider: NotificationProvider = {
  name: "sendgrid",
  channel: "EMAIL",
  async send(recipient, message): Promise<SendResult> {
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.EMAIL_FROM ?? "no-reply@legacyx.example";
    if (!key) {
      return {
        ok: false,
        error: "SENDGRID_API_KEY not configured",
        retryable: false,
      };
    }
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: recipient.ref, name: recipient.name }] }],
          from: { email: from },
          subject: message.title ?? "LegacyX Clinic",
          content: [
            { type: "text/plain", value: message.text },
            ...(message.html ? [{ type: "text/html", value: message.html }] : []),
          ],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return {
          ok: false,
          error: `SendGrid ${res.status}: ${txt.slice(0, 200)}`,
          retryable: res.status >= 500,
        };
      }
      const msgId = res.headers.get("x-message-id") ?? "unknown";
      log.info({ recipient: recipient.ref, msgId }, "email sent");
      return { ok: true, providerRef: msgId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg, retryable: true };
    }
  },
};
