import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPatientSession } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  if (getPatientSession()) redirect("/");
  return <LoginScreen />;
}

function LoginScreen() {
  const t = useTranslations("login");
  const tApp = useTranslations("app");
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-background to-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-gradient flex items-center justify-center shadow-soft-lg">
              <span className="text-2xl text-white font-bold">L</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">{tApp("name")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {tApp("tagline")}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-soft space-y-4">
            <div className="text-center">
              <h2 className="font-semibold">{t("title")}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {t("subtitle")}
              </p>
            </div>
            <LoginForm
              labels={{
                tenant: t("tenant_label"),
                line: t("line_label"),
                lineHint: t("line_hint"),
                submit: t("submit"),
                loading: t("loading"),
                demoHint: t("demo_hint"),
                error: t("error"),
              }}
            />
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground pb-safe-bottom px-4">
        © {new Date().getFullYear()} LegacyX Clinic
      </p>
    </div>
  );
}
