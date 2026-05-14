import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  MapPin,
  XCircle,
  Zap,
} from "lucide-react";
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

type Appointment = {
  id: string;
  branch_name: string | null;
  scheduled_at: string;
  duration_min: number;
  channel: "WALKIN" | "LIFF" | "ONLINE" | "PHONE";
  status: "BOOKED" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  service_name: string | null;
};

export default async function VisitsPage() {
  const session = getPatientSession();
  if (!session) redirect("/login");
  const t = await getTranslations("visits");
  const locale = await getLocale();

  let visits: Visit[] = [];
  let upcoming: Appointment[] = [];
  try {
    const [vRes, aRes] = await Promise.all([
      patientJson<{ data: Visit[] }>(
        session,
        "/api/v1/patient/visits?page=1&perPage=20",
      ),
      patientJson<{ data: Appointment[] }>(
        session,
        "/api/v1/patient/appointments?upcoming=1&perPage=20",
      ),
    ]);
    visits = vRes.data ?? [];
    upcoming = aRes.data ?? [];
  } catch {
    /* empty */
  }

  // Hide appointments that already have a corresponding visit (avoid double
  // counting once reception has done check-in).
  const hasNothing = visits.length === 0 && upcoming.length === 0;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <main className="px-4 pt-4 pb-4 animate-fade-in space-y-6">
        {/* Upcoming appointments */}
        {upcoming.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5 px-1">
              <CalendarClock className="h-4 w-4 text-primary" />
              {t("upcoming_title")}
              <span className="text-muted-foreground text-xs font-normal">
                ({upcoming.length})
              </span>
            </h2>
            <ul className="space-y-2">
              {upcoming.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  locale={locale}
                  labels={{
                    walkin: t("walkin"),
                    scheduled: t("scheduled"),
                    statusBooked: t("status_booked"),
                    statusConfirmed: t("status_confirmed"),
                    statusCheckedIn: t("status_checked_in"),
                  }}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {/* Past visits */}
        {visits.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5 px-1">
              <FileText className="h-4 w-4 text-primary" />
              {t("past_title")}
              <span className="text-muted-foreground text-xs font-normal">
                ({visits.length})
              </span>
            </h2>
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
          </section>
        ) : null}

        {hasNothing ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t("empty")}</p>
            <a
              href="/"
              className="inline-block mt-3 text-xs font-semibold text-primary"
            >
              {t("book_cta")} →
            </a>
          </div>
        ) : null}
      </main>
    </>
  );
}

function AppointmentCard({
  appointment,
  locale,
  labels,
}: {
  appointment: Appointment;
  locale: string;
  labels: {
    walkin: string;
    scheduled: string;
    statusBooked: string;
    statusConfirmed: string;
    statusCheckedIn: string;
  };
}) {
  const d = new Date(appointment.scheduled_at);
  const date = d.toLocaleDateString(locale === "th" ? "th-TH" : undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(locale === "th" ? "th-TH" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isWalkin = appointment.channel === "WALKIN";

  const statusLabel =
    appointment.status === "CHECKED_IN"
      ? labels.statusCheckedIn
      : appointment.status === "CONFIRMED"
        ? labels.statusConfirmed
        : labels.statusBooked;

  return (
    <li className="rounded-2xl border bg-card p-4 shadow-soft animate-slide-up">
      <header className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
          {isWalkin ? (
            <Zap className="h-3 w-3" />
          ) : (
            <CalendarClock className="h-3 w-3" />
          )}
          {isWalkin ? labels.walkin : labels.scheduled}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {statusLabel}
        </span>
      </header>

      <p className="text-sm font-semibold leading-tight">
        {appointment.service_name ?? "—"}
      </p>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {date} · {time}
        </span>
        {appointment.branch_name ? (
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3" />
            {appointment.branch_name}
          </span>
        ) : null}
      </div>
    </li>
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
