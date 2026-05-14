import { logger } from "../../logger";
import type { NotificationProvider, SendResult } from "./types";

const log = logger.child({ provider: "line" });

const LINE_API = "https://api.line.me/v2/bot/message/push";

/**
 * LINE Messaging API provider.
 *
 * Reads `LINE_CHANNEL_ACCESS_TOKEN` from env. If missing, returns a non-retryable
 * error so the dispatcher can decide whether to fall back to console.
 *
 * Spec: https://developers.line.biz/en/reference/messaging-api/#send-push-message
 */
export const lineProvider: NotificationProvider = {
  name: "line-messaging-api",
  channel: "LINE",
  async send(recipient, message): Promise<SendResult> {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return {
        ok: false,
        error: "LINE_CHANNEL_ACCESS_TOKEN not configured",
        retryable: false,
      };
    }

    const messages: Array<Record<string, unknown>> = [
      { type: "text", text: message.text },
    ];
    if (message.deepLink) {
      messages.push({
        type: "text",
        text: message.deepLink,
      });
    }

    try {
      const res = await fetch(LINE_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: recipient.ref, messages }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        // 4xx are non-retryable (invalid recipient, etc.); 5xx are retryable.
        return {
          ok: false,
          error: `LINE ${res.status}: ${txt.slice(0, 200)}`,
          retryable: res.status >= 500,
        };
      }
      const requestId = res.headers.get("x-line-request-id") ?? "unknown";
      log.info({ recipient: recipient.ref, requestId }, "LINE push sent");
      return { ok: true, providerRef: requestId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg, retryable: true };
    }
  },
};
