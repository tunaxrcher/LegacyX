import type { NotificationProvider, SendResult } from "./types";

/**
 * SMS provider stub.
 *
 * Real implementation would call e.g. Twilio:
 *   POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
 * with form-encoded `To`, `From`, `Body`.
 *
 * We expose a no-op skeleton so the dispatcher can flip to a real provider via
 * env without touching code.
 */
export const smsTwilioProvider: NotificationProvider = {
  name: "twilio",
  channel: "SMS",
  async send(recipient): Promise<SendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) {
      return {
        ok: false,
        error: "Twilio credentials not configured (TWILIO_*)",
        retryable: false,
      };
    }
    // TODO: real Twilio call. For now we just mark non-retryable so the
    // dispatcher records it and moves on. Hooking up the real call is a
    // one-method PR (POST form-data with `To`, `From`, `Body`).
    return {
      ok: false,
      error: "Twilio integration stub — real send not implemented",
      retryable: false,
    };
  },
};
