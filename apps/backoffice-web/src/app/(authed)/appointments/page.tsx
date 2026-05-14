import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { AppointmentToolbar } from "./AppointmentToolbar";
import {
  AppointmentCard,
  STATUS_VARIANT,
  patientLabel,
  type Appointment,
} from "./AppointmentCard";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { CheckInDialog } from "./CheckInDialog";
import { AppointmentRowActions } from "./AppointmentRowActions";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  fmtDateInput,
  isToday,
  isView,
  parseAnchor,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type ViewMode,
} from "./time-utils";

export const dynamic = "force-dynamic";

type ListResp = {
  data: Appointment[];
  pagination: { total: number; page: number; perPage: number };
};

type StaffOption = { id: string; fullName: string; primaryRoleCode: string };

const STATUS_KEYS = [
  "BOOKED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: {
    view?: string;
    date?: string;
    status?: string;
    doctor_id?: string;
    q?: string;
    page?: string;
  };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const view: ViewMode = isView(searchParams.view) ? searchParams.view : "day";
  const anchor = parseAnchor(searchParams.date);
  const status = searchParams.status ?? "";
  const doctorId = searchParams.doctor_id ?? "";
  const q = searchParams.q ?? "";

  // Compute the visible window per view.
  const { from, to, rangeLabel } = (() => {
    if (view === "month") {
      const s = startOfMonth(anchor);
      const e = endOfMonth(anchor);
      // Pad to full week grid so we fetch surrounding-month chips too.
      const padStart = startOfWeek(s);
      const padEnd = endOfWeek(e);
      return {
        from: padStart,
        to: padEnd,
        rangeLabel: new Intl.DateTimeFormat("en-GB", {
          month: "long",
          year: "numeric",
        }).format(anchor),
      };
    }
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = endOfWeek(anchor);
      const fmt = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      });
      return {
        from: s,
        to: e,
        rangeLabel: `${fmt.format(s)} – ${fmt.format(e)}`,
      };
    }
    if (view === "list") {
      // List view = no time window (or very wide); show pagination header
      return {
        from: null as Date | null,
        to: null as Date | null,
        rangeLabel: t("appointments.view_list"),
      };
    }
    // day
    return {
      from: startOfDay(anchor),
      to: endOfDay(anchor),
      rangeLabel: new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(anchor),
    };
  })();

  // Build query params for the appointments fetch
  const apptParams = new URLSearchParams();
  if (from) apptParams.set("from", from.toISOString());
  if (to) apptParams.set("to", to.toISOString());
  if (status) apptParams.set("status", status);
  if (doctorId) apptParams.set("doctor_id", doctorId);
  if (q) apptParams.set("q", q);
  if (view === "list") {
    apptParams.set("page", searchParams.page ?? "1");
    apptParams.set("perPage", "30");
  } else if (view === "month") {
    apptParams.set("perPage", "500");
  } else {
    apptParams.set("perPage", "200");
  }

  // KPI ranges (counts only — uses lightweight separate fetches)
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const [list, kpiToday, kpiWeek, kpiMonth, kpiCancelled, staffRes] =
    await Promise.all([
      apiJson<ListResp>(session, `/api/v1/appointments?${apptParams}`).catch(
        () => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } }) as ListResp,
      ),
      apiJson<ListResp>(
        session,
        `/api/v1/appointments?from=${encodeURIComponent(todayStart.toISOString())}&to=${encodeURIComponent(todayEnd.toISOString())}&perPage=1`,
      ).catch(
        () => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } }) as ListResp,
      ),
      apiJson<ListResp>(
        session,
        `/api/v1/appointments?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(weekEnd.toISOString())}&perPage=1`,
      ).catch(
        () => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } }) as ListResp,
      ),
      apiJson<ListResp>(
        session,
        `/api/v1/appointments?from=${encodeURIComponent(monthStart.toISOString())}&to=${encodeURIComponent(monthEnd.toISOString())}&perPage=1`,
      ).catch(
        () => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } }) as ListResp,
      ),
      apiJson<ListResp>(
        session,
        `/api/v1/appointments?status=CANCELLED&from=${encodeURIComponent(monthStart.toISOString())}&to=${encodeURIComponent(monthEnd.toISOString())}&perPage=1`,
      ).catch(
        () => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } }) as ListResp,
      ),
      apiJson<{ data: StaffOption[] }>(
        session,
        "/api/v1/staff?role=DOCTOR",
      ).catch(() => ({ data: [] as StaffOption[] })),
    ]);

  // Pre-compute status labels (server-side, so the views don't need next-intl).
  const statusLabels: Record<string, string> = {};
  for (const s of STATUS_KEYS) {
    const key = `appointments.status.${s}`;
    statusLabels[s] = t.has(key as never) ? t(key as never) : s;
  }

  const searchParamsString = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v != null) as Array<
      [string, string]
    >,
  ).toString();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("appointments.title")}
        description={`${t("appointments.subtitle")} · ${session.branchName ?? ""}`}
        actions={<NewAppointmentDialog />}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label={t("appointments.kpi_today")}
          value={kpiToday.pagination.total}
          tone="info"
          href={`/appointments?view=day&date=${fmtDateInput(new Date())}`}
        />
        <KpiTile
          label={t("appointments.kpi_week")}
          value={kpiWeek.pagination.total}
          tone="success"
          href={`/appointments?view=week&date=${fmtDateInput(new Date())}`}
        />
        <KpiTile
          label={t("appointments.kpi_month")}
          value={kpiMonth.pagination.total}
          tone="muted"
          href={`/appointments?view=month&date=${fmtDateInput(new Date())}`}
        />
        <KpiTile
          label={t("appointments.kpi_cancelled")}
          value={kpiCancelled.pagination.total}
          tone="destructive"
          href={`/appointments?view=list&status=CANCELLED`}
        />
      </div>

      <AppointmentToolbar
        view={view}
        anchorISO={fmtDateInput(anchor)}
        rangeLabel={rangeLabel}
        status={status}
        doctorId={doctorId}
        q={q}
        doctors={staffRes.data
          .filter((s) => s.primaryRoleCode === "DOCTOR")
          .map((s) => ({ id: s.id, fullName: s.fullName }))}
      />

      {/* Body */}
      {view === "day" && (
        <DayBody
          appointments={list.data}
          rangeLabel={rangeLabel}
          isAnchorToday={isToday(anchor)}
          statusLabels={statusLabels}
          t={t}
        />
      )}
      {view === "week" && (
        <WeekView
          appointments={list.data}
          anchor={anchor}
          statusLabels={statusLabels}
          searchParamsString={searchParamsString}
        />
      )}
      {view === "month" && (
        <MonthView
          appointments={list.data}
          anchor={anchor}
          statusLabels={statusLabels}
          searchParamsString={searchParamsString}
        />
      )}
      {view === "list" && (
        <ListBody
          appointments={list.data}
          pagination={list.pagination}
          statusLabels={statusLabels}
          searchParamsString={searchParamsString}
          t={t}
        />
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: "info" | "success" | "muted" | "destructive";
  href: string;
}) {
  const colour = {
    info: "text-info",
    success: "text-success",
    muted: "text-muted-foreground",
    destructive: "text-destructive",
  }[tone];
  return (
    <a href={href}>
      <Card className="transition-all hover:-translate-y-0.5 hover:shadow-soft-lg">
        <CardContent className="py-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${colour}`}>
            {value}
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

function DayBody({
  appointments,
  rangeLabel,
  isAnchorToday,
  statusLabels,
  t,
}: {
  appointments: Appointment[];
  rangeLabel: string;
  isAnchorToday: boolean;
  statusLabels: Record<string, string>;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-5 w-5" />}
        title={t("appointments.empty_title")}
        description={t("appointments.empty_desc")}
        action={<NewAppointmentDialog />}
      />
    );
  }
  const sorted = appointments
    .slice()
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{rangeLabel}</div>
          <div className="text-xs text-muted-foreground">
            {appointments.length} {appointments.length === 1 ? "appt" : "appts"}
            {isAnchorToday && ` · ${t("common.today")}`}
          </div>
        </div>
        <ol className="relative space-y-3 before:absolute before:left-[27px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {sorted.map((a) => (
            <li key={a.id} className="relative pl-12">
              <span className="absolute left-[22px] top-6 flex h-3 w-3 items-center justify-center rounded-full border-2 border-primary bg-background shadow-soft" />
              <AppointmentCard appt={a} statusLabels={statusLabels} />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ListBody({
  appointments,
  pagination,
  statusLabels,
  searchParamsString,
  t,
}: {
  appointments: Appointment[];
  pagination: ListResp["pagination"];
  statusLabels: Record<string, string>;
  searchParamsString: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const fmt = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / Math.max(1, pagination.perPage)),
  );
  const params = new URLSearchParams(searchParamsString);

  return (
    <Card>
      <CardContent className="p-0">
        {appointments.length === 0 ? (
          <EmptyState
            className="m-6"
            icon={<CalendarDays className="h-5 w-5" />}
            title={t("appointments.empty_title")}
            description={t("appointments.empty_desc")}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("appointments.scheduled_at")}</TableHead>
                  <TableHead>{t("appointments.patient")}</TableHead>
                  <TableHead>{t("appointments.doctor")}</TableHead>
                  <TableHead>{t("appointments.duration")}</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("appointments.notes")}</TableHead>
                  <TableHead className="w-[140px] text-right">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((a) => {
                  const variant = STATUS_VARIANT[a.status] ?? "secondary";
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm tabular-nums">
                        {fmt.format(new Date(a.scheduledAt))}
                      </TableCell>
                      <TableCell className="text-sm">
                        {patientLabel(a.patient, a.patientId)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.doctor?.fullName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.durationMin}m
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.channel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant}>
                          {statusLabels[a.status] ?? a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                        {a.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(a.status === "BOOKED" ||
                            a.status === "CONFIRMED") && (
                            <CheckInDialog
                              appointmentId={a.id}
                              patientLabel={patientLabel(a.patient, a.patientId)}
                            />
                          )}
                          <AppointmentRowActions
                            appointmentId={a.id}
                            status={a.status}
                            scheduledAt={a.scheduledAt}
                            durationMin={a.durationMin}
                            doctorId={a.doctorId}
                            reason={a.reason}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
              <div>
                {pagination.total} {t("appointments.results")}
              </div>
              <div className="flex items-center gap-2">
                <PaginationLink
                  disabled={pagination.page <= 1}
                  href={(() => {
                    params.set("page", String(pagination.page - 1));
                    return `/appointments?${params}`;
                  })()}
                  label="‹"
                />
                <span>
                  {pagination.page} / {totalPages}
                </span>
                <PaginationLink
                  disabled={pagination.page >= totalPages}
                  href={(() => {
                    params.set("page", String(pagination.page + 1));
                    return `/appointments?${params}`;
                  })()}
                  label="›"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PaginationLink({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground/50">
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border bg-background hover:bg-muted"
    >
      {label}
    </a>
  );
}
