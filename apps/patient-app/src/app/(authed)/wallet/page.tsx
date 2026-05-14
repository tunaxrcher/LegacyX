import { getTranslations, getLocale } from "next-intl/server";
import { CalendarClock, Wallet as WalletIcon } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

type WalletEntry = {
  id: string;
  type: "PURCHASE" | "USE" | "REVERSAL" | "ADJUSTMENT" | "EXPIRY";
  delta: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  notes: string | null;
  created_at: string;
};

type Wallet = {
  id: string;
  product_name: string;
  product_sku: string;
  balance: number;
  expires_at: string | null;
  expires_in_days: number | null;
  ledger: WalletEntry[];
};

export default async function WalletPage() {
  const session = getPatientSession()!;
  const t = await getTranslations("wallet");
  const locale = await getLocale();

  let wallets: Wallet[] = [];
  try {
    const res = await patientJson<{ data: Wallet[] }>(
      session,
      "/api/v1/patient/wallets",
    );
    wallets = res.data ?? [];
  } catch {
    /* empty */
  }

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <main className="px-4 pt-4 pb-4 animate-fade-in">
        {wallets.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            <WalletIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {t("empty")}
          </div>
        ) : (
          <ul className="space-y-4">
            {wallets.map((w) => (
              <li
                key={w.id}
                className="rounded-2xl border bg-card overflow-hidden shadow-soft animate-slide-up"
              >
                <div className="bg-primary-gradient text-white px-4 py-4">
                  <p className="text-xs opacity-90">{w.product_sku}</p>
                  <p className="font-semibold mt-0.5">{w.product_name}</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase opacity-80">
                        {t("balance")}
                      </p>
                      <p className="text-3xl font-bold tabular-nums leading-none">
                        {w.balance}
                      </p>
                    </div>
                    <ExpiryBadge
                      expiresInDays={w.expires_in_days}
                      labelDays={(n) => t("expires_in", { n })}
                      labelExpired={t("expired")}
                      labelNone={t("no_expiry")}
                    />
                  </div>
                </div>

                <div className="px-4 py-3">
                  <p className="text-xs font-semibold mb-2">{t("ledger_title")}</p>
                  {w.ledger.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("ledger_empty")}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {w.ledger.slice(0, 6).map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {t(typeKey(e.type))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(e.created_at).toLocaleDateString(
                                locale === "th" ? "th-TH" : undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "tabular-nums font-semibold",
                              e.delta < 0
                                ? "text-destructive"
                                : "text-success",
                            )}
                          >
                            {e.delta > 0 ? "+" : ""}
                            {e.delta}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function typeKey(t: WalletEntry["type"]) {
  return `type_${t}` as
    | "type_PURCHASE"
    | "type_USE"
    | "type_REVERSAL"
    | "type_ADJUSTMENT"
    | "type_EXPIRY";
}

function ExpiryBadge({
  expiresInDays,
  labelDays,
  labelExpired,
  labelNone,
}: {
  expiresInDays: number | null;
  labelDays: (n: number) => string;
  labelExpired: string;
  labelNone: string;
}) {
  if (expiresInDays === null) {
    return (
      <span className="text-[10px] bg-white/15 px-2 py-1 rounded-full">
        {labelNone}
      </span>
    );
  }
  if (expiresInDays <= 0) {
    return (
      <span className="text-[10px] bg-destructive/80 px-2 py-1 rounded-full">
        {labelExpired}
      </span>
    );
  }
  return (
    <span className="text-[10px] bg-white/15 px-2 py-1 rounded-full inline-flex items-center gap-1">
      <CalendarClock className="h-3 w-3" />
      {labelDays(expiresInDays)}
    </span>
  );
}
