export type ProviderRecipient = {
  /** Channel-specific identifier (LINE userId, phone E.164, email address). */
  ref: string;
  /** Optional display name (for logging). */
  name?: string;
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
} | {
  ok: false;
  error: string;
  retryable: boolean;
};

export type NotificationProvider = {
  name: string;
  channel: "LINE" | "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  send: (recipient: ProviderRecipient, message: ProviderMessage) => Promise<SendResult>;
};
