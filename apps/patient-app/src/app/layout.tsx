import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const thai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LegacyX — Patient",
  description: "Your clinic in your pocket — booking, history, courses, aftercare.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LegacyX",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#1bb59b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body
        className={cn(
          sans.variable,
          thai.variable,
          locale === "th" ? "font-thai" : "font-sans",
          "min-h-screen bg-background text-foreground antialiased",
        )}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
