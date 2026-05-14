import { getTranslations, getLocale } from "next-intl/server";
import { CheckCircle2, Circle, Clock, FileText, XCircle } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { formatCurrency } from "@/lib/utils";

type Visit = {
  id: string;
  branch_id: string;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  checked_in_at: string | null;
  completed_at: string | null;
  created_at: string;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    currency: string;
  }>;
  services: Array<{
    description: string;
    qty: string;
    total: string;
    kind: string;
  }>;
};

export default async function VisitsPage() {
  const session = getPatientSession()!;
  const t = await getTranslations("visits");
  const locale = await getLocale();

  let visits: Visit[] = [];
  try {
    const res = await patientJson<{ data: Visit[] }>(
      session,
      "/api/v1/patient/visits?page=1&perPage=20",
    );
    visits = res.data ?? [];
  } catch {
    /* empty */
  }

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <main className="px-4 pt-4 pb-4 animate-fade-in">
        {visits.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {visits.map((v) => {
              const date = new Date(v.completed_at ?? v.created_at);
              return (
                <li
                  key={v.id}
                  className="rounded-2xl border bg-card p-4 shadow-soft animate-slide-up"
                >
                  <header className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={v.status} />
                      <p className="text-sm font-medium">
                        {date.toLocaleDateString(locale === "th" ? "th-TH" : undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {t(statusLabelKey(v.status))}
                    </span>
                  </header>

                  {v.services.length > 0 ? (
                    <ul className="text-xs space-y-1">
                      {v.services.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="truncate text-muted-foreground">
                            {s.description}
                          </span>
                          <span className="tabular-nums text-foreground">
                            {formatCurrency(s.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("no_services")}
                    </p>
                  )}

                  {v.invoices.length > 0 && (
                    <footer className="mt-3 pt-3 border-t flex items-center justify-between">
                      <div className="text-[11px] text-muted-foreground">
                        {t("invoice")} #{v.invoices[0]!.number}
                      </div>
                      <a
                        href={`/visits/${v.id}/receipt`}
                        className="text-xs font-semibold text-primary inline-flex items-center gap-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {t("view_receipt")}
                      </a>
                    </footer>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

function statusLabelKey(s: Visit["status"]): "completed" | "in_progress" | "open" | "cancelled" {
  if (s === "COMPLETED") return "completed";
  if (s === "IN_PROGRESS") return "in_progress";
  if (s === "CANCELLED") return "cancelled";
  return "open";
}

function StatusIcon({ status }: { status: Visit["status"] }) {
  if (status === "COMPLETED")
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "IN_PROGRESS") return <Clock className="h-4 w-4 text-primary" />;
  if (status === "CANCELLED")
    return <XCircle className="h-4 w-4 text-destructive" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}
