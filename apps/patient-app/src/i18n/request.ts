import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales, localeCookie, type Locale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get(localeCookie)?.value as Locale | undefined;
  const locale: Locale =
    cookieLocale && (locales as readonly string[]).includes(cookieLocale)
      ? cookieLocale
      : defaultLocale;
  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});
