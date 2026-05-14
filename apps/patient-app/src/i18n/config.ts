export const locales = ["th", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "th";
export const localeCookie = "lx_patient_locale";

export const localeLabels: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
};
