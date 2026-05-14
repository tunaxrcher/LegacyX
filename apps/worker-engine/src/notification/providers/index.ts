import type { NotificationProvider } from "./types";
import { makeConsoleProvider } from "./console";
import { lineProvider } from "./line";
import { smsTwilioProvider } from "./sms";
import { emailSendgridProvider } from "./email";

/**
 * Pick a provider per channel based on env. Defaults to the console stub which
 * just appends a JSON line to `storage/notifications/{channel}.log` — perfect
 * for demos and CI.
 *
 *   NOTIFICATION_LINE_PROVIDER  = "console" | "line-messaging-api"
 *   NOTIFICATION_SMS_PROVIDER   = "console" | "twilio"
 *   NOTIFICATION_EMAIL_PROVIDER = "console" | "sendgrid"
 */
function pick(channel: "LINE" | "SMS" | "EMAIL"): NotificationProvider {
  const envKey =
    channel === "LINE"
      ? "NOTIFICATION_LINE_PROVIDER"
      : channel === "SMS"
        ? "NOTIFICATION_SMS_PROVIDER"
        : "NOTIFICATION_EMAIL_PROVIDER";
  const choice = process.env[envKey] ?? "console";
  if (channel === "LINE" && choice === "line-messaging-api") return lineProvider;
  if (channel === "SMS" && choice === "twilio") return smsTwilioProvider;
  if (channel === "EMAIL" && choice === "sendgrid") return emailSendgridProvider;
  return makeConsoleProvider(channel);
}

export const providers = {
  LINE: pick("LINE"),
  SMS: pick("SMS"),
  EMAIL: pick("EMAIL"),
} satisfies Record<"LINE" | "SMS" | "EMAIL", NotificationProvider>;

export type { NotificationProvider };
