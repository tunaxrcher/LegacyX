import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CalendarPlus,
  ChevronRight,
  ScrollText,
  Wallet as WalletIcon,
  Sparkles,
} from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

type WalletItem = {
  id: string;
  product_name: string;
  balance: number;
  expires_in_days: number | null;
};

type AftercareItem = {
  visit_id: string;
  title: string;
  body: string;
  cta_label: string;
  cta_kind: "REBOOK" | "REVIEW" | "READ";
};

function greetingKey(): "greet_morning" | "greet_afternoon" | "greet_evening" {
  const h = new Date().getHours();
  if (h < 12) return "greet_morning";
  if (h < 17) return "greet_afternoon";
  return "greet_evening";
}

export default async function HomePage() {
  const session = getPatientSession()!;
  const t = await getTranslations("home");

  let wallets: WalletItem[] = [];
  let aftercare: AftercareItem[] = [];
  try {
    const [w, a] = await Promise.all([
      patientJson<{ data: WalletItem[] }>(session, "/api/v1/patient/wallets"),
      patientJson<{ data: AftercareItem[] }>(
        session,
        "/api/v1/patient/aftercare",
      ),
    ]);
    wallets = w.data ?? [];
    aftercare = a.data ?? [];
  } catch {
    /* render empty state if API is down — don't crash the home screen */
  }
  const activeWalletCount = wallets.filter((w) => w.balance > 0).length;

  return (
    <>
      <PageHeader title="LegacyX" />
      <main className="px-4 pt-4 pb-4 space-y-5 animate-fade-in">
        {/* Greeting */}
        <section className="rounded-2xl bg-primary-gradient text-white p-5 shadow-soft-lg">
          <p className="text-xs opacity-90">{t(greetingKey())}</p>
          <h2 className="text-xl font-semibold mt-0.5">
            {session.patient.first_name} {session.patient.last_name}
          </h2>
          <p className="text-xs opacity-80 mt-0.5">
            {t("hn_label")}: {session.patient.hn}
          </p>
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-3 gap-3">
          <QuickAction
            href="/book"
            icon={<CalendarPlus className="h-5 w-5" />}
            label={t("quick_book")}
          />
          <QuickAction
            href="/visits"
            icon={<ScrollText className="h-5 w-5" />}
            label={t("quick_visits")}
          />
          <QuickAction
            href="/wallet"
            icon={<WalletIcon className="h-5 w-5" />}
            label={t("quick_wallet")}
          />
        </section>

        {/* Aftercare */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("aftercare_title")}
            </h3>
          </div>
          {aftercare.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t("aftercare_empty")}
            </div>
          ) : (
            <ul className="space-y-2">
              {aftercare.map((a) => (
                <li
                  key={`${a.visit_id}-${a.title}`}
                  className="rounded-xl border bg-card p-3.5 shadow-soft animate-slide-up"
                >
                  <p className="font-medium text-sm">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {a.body}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    {a.cta_label} →
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Wallet summary */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-semibold">{t("wallet_summary_title")}</h3>
            <Link
              href="/wallet"
              className="text-[11px] font-medium text-primary inline-flex items-center"
            >
              {t("view_all")} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {wallets.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t("wallet_summary_empty")}
            </div>
          ) : (
            <div className="rounded-2xl bg-card border p-4 shadow-soft">
              <p className="text-xs text-muted-foreground">
                {t("wallet_summary_active", { n: activeWalletCount })}
              </p>
              <ul className="mt-3 space-y-2">
                {wallets.slice(0, 3).map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate pr-3">{w.product_name}</span>
                    <span className="font-semibold tabular-nums text-primary">
                      {w.balance}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-card border p-3 text-center shadow-soft hover:bg-accent/50 active:scale-[0.98] transition"
    >
      <span className="h-9 w-9 rounded-full bg-accent text-accent-foreground inline-flex items-center justify-center">
        {icon}
      </span>
      <span className="text-[11px] font-medium leading-tight">{label}</span>
    </Link>
  );
}
