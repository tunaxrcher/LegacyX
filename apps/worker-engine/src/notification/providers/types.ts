export type ProviderRecipient = {
  /** Channel-specific identifier (LINE userId, phone E.164, email address). */
  ref: string;
  /** Optional display name (for logging). */
  name?: string;
  /** Optional patient id (used by the dispatcher to write back delivery
   *  state — e.g. `lineFriendStatus = BLOCKED` after a 403). */
  patientId?: string;
};

export type ProviderMessage = {
  /** Plain-text body (already templated + localised). */
  text: string;
  /** Rich HTML for EMAIL channel; ignored by LINE/SMS. */
  html?: string;
  /** Optional title — used as EMAIL subject; ignored by LINE/SMS. */
  title?: string;
  /** Optional deep-link to surface (LIFF URL / web URL). */
  deepLink?: string;
};

export type SendResult = {
  ok: true;
  providerRef: string;
  /** Channel-specific status hint surfaced back to the dispatcher
   *  (e.g. `friend: true` after a successful LINE push). */
  channelStatus?: Record<string, unknown>;
} | {
  ok: false;
  error: string;
  retryable: boolean;
  /** Same idea on the error path — e.g. `{ friend: false }` when LINE
   *  returns 403 "you can't send messages to this user". */
  channelStatus?: Record<string, unknown>;
};

export type NotificationProvider = {
  name: string;
  channel: "LINE" | "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  send: (recipient: ProviderRecipient, message: ProviderMessage) => Promise<SendResult>;
};
