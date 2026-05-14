import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { PhoneLoginForm } from "./PhoneLoginForm";

/**
 * Patient login — phone number entry (step 1 of 2).
 * UI for step 2 (OTP) lives at `/login/otp`.
 *
 * The OTP verification itself is mocked for v1 (any 6-digit code is accepted
 * server-side). The actual auth happens by matching `phoneHash` against the
 * Patient table — so only users who have BOOKED at least once can log in.
 */
export default async function LoginPage() {
  if (getPatientSession()) redirect("/");
  const t = await getTranslations("login");
  const tApp = await getTranslations("app");

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-background to-background flex flex-col">
      <div className="px-4 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back_home")}
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 -mt-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <Image
              src="/logo.png"
              alt={tApp("name")}
              width={1000}
              height={234}
              priority
              className="mx-auto h-14 w-auto object-contain"
            />
            <p className="text-sm text-muted-foreground mt-1">
              {tApp("tagline")}
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-soft space-y-5">
            <div className="text-center">
              <h2 className="font-semibold">{t("phone_title")}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {t("phone_subtitle")}
              </p>
            </div>
            <PhoneLoginForm />
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            {t("not_member")}{" "}
            <Link href="/" className="font-semibold text-primary">
              {t("book_to_register")}
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground pb-safe-bottom px-4 pb-4">
        © {new Date().getFullYear()} {tApp("name")}
      </p>
    </div>
  );
}
