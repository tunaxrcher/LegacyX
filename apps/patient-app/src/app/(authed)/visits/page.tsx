import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  MapPin,
  Receipt,
  Sparkles,
  Stethoscope,
  Tag,
  Timer,
  XCircle,
  Zap,
} from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/animated-number";
import { formatCurrency } from "@/lib/utils";

type Visit = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  branch_address: string | null;
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
  branch_address: string | null;
  scheduled_at: string;
  duration_min: number;
  channel: "WALKIN" | "LIFF" | "ONLINE" | "PHONE";
  status:
    | "BOOKED"
    | "CONFIRMED"
    | "CHECKED_IN"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  service_name: string | null;
  service_name_th: string | null;
  service_category_name: string | null;
  service_category_name_th: string | null;
  price_from: number | null;
  price_to: number | null;
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

  const hasNothing = visits.length === 0 && upcoming.length === 0;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <main className="px-4 pt-4 pb-4 space-y-7">
        {/* Upcoming appointments */}
        {upcoming.length > 0 ? (
          <section>
            <SectionHeader
              icon={<CalendarClock className="h-4 w-4 text-primary" />}
              title={t("upcoming_title")}
              count={upcoming.length}
            />
            <ul className="space-y-3">
              {upcoming.map((a, i) => (
                <li
                  key={a.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <AppointmentCard
                    appointment={a}
                    locale={locale}
                    labels={{
                      walkin: t("walkin"),
                      scheduled: t("scheduled"),
                      statusBooked: t("status_booked"),
                      statusConfirmed: t("status_confirmed"),
                      statusCheckedIn: t("status_checked_in"),
                      durationMin: t("duration_min"),
                      askPrice: t("ask_price"),
                      priceLabel: t("price_label"),
                      detailsCta: t("details_cta"),
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Past visits */}
        {visits.length > 0 ? (
          <section>
            <SectionHeader
              icon={<FileText className="h-4 w-4 text-primary" />}
              title={t("past_title")}
              count={visits.length}
            />
            <ul className="space-y-3">
              {visits.map((v, i) => (
                <li
                  key={v.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <VisitCard
                    visit={v}
                    locale={locale}
                    labels={{
                      statusKey: statusLabelKey(v.status),
                      statusCompleted: t("completed"),
                      statusInProgress: t("in_progress"),
                      statusOpen: t("open"),
                      statusCancelled: t("cancelled"),
                      invoice: t("invoice"),
                      viewReceipt: t("view_receipt"),
                      noServices: t("no_services"),
                      totalLabel: t("total_label"),
                      qtyLabel: t("qty_label"),
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasNothing ? (
          <div className="rounded-3xl border border-dashed bg-card p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <CalendarClock className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
            <Link
              href="/"
              className="btn-gradient mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("book_cta")}
            </Link>
          </div>
        ) : null}
      </main>
    </>
  );
}

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2.5 flex items-center gap-1.5 px-1 text-muted-foreground">
      {icon}
      <span className="text-foreground">{title}</span>
      <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
        <AnimatedNumber value={count} />
      </span>
    </h2>
  );
}

function formatPrice(
  priceFrom: number | null,
  priceTo: number | null,
  locale: string,
  fallbackAsk: string,
): string {
  if (priceFrom == null && priceTo == null) return fallbackAsk;
  if (priceFrom === 0 && priceTo == null) {
    return locale === "th" ? "ฟรี" : "Free";
  }
  if (priceFrom != null && priceTo != null && priceFrom !== priceTo) {
    return `${priceFrom.toLocaleString()} - ${priceTo.toLocaleString()}.-`;
  }
  return `${(priceFrom ?? priceTo ?? 0).toLocaleString()}.-`;
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
    durationMin: string;
    askPrice: string;
    priceLabel: string;
    detailsCta: string;
  };
}) {
  const d = new Date(appointment.scheduled_at);
  const dayLabel = d.toLocaleDateString(
    locale === "th" ? "th-TH" : undefined,
    { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );
  const timeLabel = d.toLocaleTimeString(locale === "th" ? "th-TH" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayNum = d.toLocaleDateString(locale === "th" ? "th-TH" : undefined, {
    day: "numeric",
  });
  const monthShort = d.toLocaleDateString(
    locale === "th" ? "th-TH" : undefined,
    { month: "short" },
  );
  const isWalkin = appointment.channel === "WALKIN";

  const statusLabel =
    appointment.status === "CHECKED_IN"
      ? labels.statusCheckedIn
      : appointment.status === "CONFIRMED"
        ? labels.statusConfirmed
        : labels.statusBooked;

  const statusTone =
    appointment.status === "CHECKED_IN"
      ? "bg-success/10 text-success"
      : appointment.status === "CONFIRMED"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";

  // Live status — checked-in patients are "active right now", walk-ins are
  // happening immediately. Both get a soft breathing dot to feel alive.
  const isLive = appointment.status === "CHECKED_IN" || isWalkin;

  const serviceName =
    (locale === "th" ? appointment.service_name_th : appointment.service_name) ??
    appointment.service_name ??
    "—";

  const categoryName =
    (locale === "th"
      ? appointment.service_category_name_th
      : appointment.service_category_name) ??
    appointment.service_category_name ??
    null;

  const priceText = formatPrice(
    appointment.price_from,
    appointment.price_to,
    locale,
    labels.askPrice,
  );

  return (
    <div className="rounded-3xl border bg-card shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
      {/* Top row: date tile + service info */}
      <div className="flex items-stretch gap-3 p-4">
        {/* Date tile */}
        <div
          className={`shrink-0 w-16 rounded-2xl flex flex-col items-center justify-center py-2 ${
            isWalkin
              ? "bg-amber-500/10 text-amber-600"
              : "bg-primary/10 text-primary"
          }`}
        >
          {isWalkin ? (
            <>
              <Zap className="h-4 w-4" />
              <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">
                {labels.walkin}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl font-extrabold leading-none">
                {dayNum}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">
                {monthShort}
              </span>
            </>
          )}
        </div>

        {/* Right column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            {categoryName ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <Tag className="h-3 w-3" />
                {categoryName}
              </span>
            ) : (
              <span />
            )}
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusTone}`}
            >
              {isLive ? (
                <span
                  aria-hidden="true"
                  className="pulse-dot inline-block h-1.5 w-1.5 rounded-full"
                />
              ) : null}
              {statusLabel}
            </span>
          </div>

          <h3 className="text-base font-bold leading-tight truncate">
            {serviceName}
          </h3>

          {!isWalkin ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {dayLabel} · {timeLabel}
            </p>
          ) : null}
        </div>
      </div>

      {/* Detail strip */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <DetailPill
          icon={<Timer className="h-3.5 w-3.5" />}
          label={`${appointment.duration_min} ${labels.durationMin}`}
        />
        <DetailPill
          icon={<Stethoscope className="h-3.5 w-3.5 text-primary" />}
          label={priceText}
          highlight
        />
        {appointment.branch_name ? (
          <DetailPill
            icon={<MapPin className="h-3.5 w-3.5" />}
            label={appointment.branch_name}
            full
          />
        ) : null}
      </div>
    </div>
  );
}

function DetailPill({
  icon,
  label,
  highlight,
  full,
}: {
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
  full?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${
        highlight
          ? "bg-primary/5 text-primary font-semibold"
          : "bg-muted/60 text-muted-foreground"
      } ${full ? "col-span-2" : ""}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function VisitCard({
  visit,
  locale,
  labels,
}: {
  visit: Visit;
  locale: string;
  labels: {
    statusKey: "completed" | "in_progress" | "open" | "cancelled";
    statusCompleted: string;
    statusInProgress: string;
    statusOpen: string;
    statusCancelled: string;
    invoice: string;
    viewReceipt: string;
    noServices: string;
    totalLabel: string;
    qtyLabel: string;
  };
}) {
  const date = new Date(visit.completed_at ?? visit.created_at);
  const dayLabel = date.toLocaleDateString(
    locale === "th" ? "th-TH" : undefined,
    { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );
  const statusLabel =
    labels.statusKey === "completed"
      ? labels.statusCompleted
      : labels.statusKey === "in_progress"
        ? labels.statusInProgress
        : labels.statusKey === "cancelled"
          ? labels.statusCancelled
          : labels.statusOpen;
  const statusTone =
    visit.status === "COMPLETED"
      ? "bg-success/10 text-success"
      : visit.status === "IN_PROGRESS"
        ? "bg-primary/10 text-primary"
        : visit.status === "CANCELLED"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";

  // Sum invoices for headline total. Falls back to service-line sum when no
  // invoice has been created yet (e.g. visit still in progress).
  const invoiceTotal = visit.invoices.reduce(
    (acc, i) => acc + Number(i.total || 0),
    0,
  );
  const serviceTotal = visit.services.reduce(
    (acc, s) => acc + Number(s.total || 0),
    0,
  );
  const total = invoiceTotal > 0 ? invoiceTotal : serviceTotal;
  const currency = visit.invoices[0]?.currency ?? "THB";

  return (
    <div className="rounded-3xl border bg-card shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
      <header className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon status={visit.status} />
            <p className="text-sm font-semibold">{dayLabel}</p>
          </div>
          {visit.branch_name ? (
            <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {visit.branch_name}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusTone}`}
        >
          {visit.status === "IN_PROGRESS" ? (
            <span
              aria-hidden="true"
              className="pulse-dot inline-block h-1.5 w-1.5 rounded-full"
            />
          ) : null}
          {statusLabel}
        </span>
      </header>

      {visit.services.length > 0 ? (
        <ul className="px-4 pt-2 pb-2 space-y-1.5">
          {visit.services.map((s, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate">{s.description}</p>
                {Number(s.qty) > 1 ? (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {labels.qtyLabel}: {Number(s.qty).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <span className="tabular-nums text-foreground font-medium shrink-0">
                {formatCurrency(s.total, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          {labels.noServices}
        </p>
      )}

      {total > 0 || visit.invoices.length > 0 ? (
        <footer className="mx-4 mt-2 mb-4 rounded-2xl bg-muted/40 px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              {visit.invoices.length > 0 ? (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {labels.invoice} #{visit.invoices[0]!.number}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {labels.totalLabel}
                </p>
              )}
              {total > 0 ? (
                <p className="text-sm font-bold tabular-nums">
                  {formatCurrency(total.toString(), currency)}
                </p>
              ) : null}
            </div>
          </div>
          {visit.invoices.length > 0 ? (
            <Link
              href={`/visits/${visit.id}/receipt`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 active:scale-[0.97] transition"
            >
              <FileText className="h-3.5 w-3.5" />
              {labels.viewReceipt}
            </Link>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}

function statusLabelKey(
  s: Visit["status"],
): "completed" | "in_progress" | "open" | "cancelled" {
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
