import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Activity, User, Clock, ArrowRight, DoorOpen } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTime, formatRelative } from "@/lib/utils";
import { StartVisitButton } from "./StartVisitButton";

export const dynamic = "force-dynamic";

type Visit = {
  id: string;
  status: string;
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  patient: { id: string; hn: string; firstName: string; lastName: string } | null;
  appointment: { id: string; scheduledAt: string; channel: string } | null;
  currentRoom: { id: string; code: string; name: string; type: string } | null;
};

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "muted" | "destructive"> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

type StatusFilter = "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED";

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  // Fetch all open + in-progress in parallel; completed is fetched only when
  // the chip is selected (keeps default page snappy).
  const status = (searchParams.status ?? "ALL") as StatusFilter;
  const q = (searchParams.q ?? "").trim().toLowerCase();

  const [openRes, inProgressRes, completedRes] = await Promise.all([
    apiJson<{ data: Visit[] }>(session, "/api/v1/visits?status=OPEN&limit=100").catch(() => ({
      data: [] as Visit[],
    })),
    apiJson<{ data: Visit[] }>(
      session,
      "/api/v1/visits?status=IN_PROGRESS&limit=100",
    ).catch(() => ({ data: [] as Visit[] })),
    status === "COMPLETED"
      ? apiJson<{ data: Visit[] }>(
          session,
          "/api/v1/visits?status=COMPLETED&limit=50",
        ).catch(() => ({ data: [] as Visit[] }))
      : Promise.resolve({ data: [] as Visit[] }),
  ]);

  const openCount = openRes.data.length;
  const inProgressCount = inProgressRes.data.length;

  let visible: Visit[] =
    status === "OPEN"
      ? openRes.data
      : status === "IN_PROGRESS"
        ? inProgressRes.data
        : status === "COMPLETED"
          ? completedRes.data
          : [...inProgressRes.data, ...openRes.data];

  if (q) {
    visible = visible.filter((v) => {
      const name = v.patient
        ? `${v.patient.firstName} ${v.patient.lastName}`.toLowerCase()
        : "";
      const hn = v.patient?.hn?.toLowerCase() ?? "";
      const room = v.currentRoom?.name?.toLowerCase() ?? "";
      return name.includes(q) || hn.includes(q) || room.includes(q);
    });
  }

  // Average dwell time = (now - checkedInAt) for unfinished visits, in min.
  const now = Date.now();
  const dwellSamples = [...openRes.data, ...inProgressRes.data]
    .map((v) => (v.checkedInAt ? (now - new Date(v.checkedInAt).getTime()) / 60000 : null))
    .filter((x): x is number => x != null && x > 0);
  const avgDwell = dwellSamples.length
    ? Math.round(dwellSamples.reduce((a, b) => a + b, 0) / dwellSamples.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("visits.title")} description={t("visits.subtitle")} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label={t("visits.kpi_waiting")} value={openCount} tone="info" />
        <KpiCard label={t("visits.kpi_in_progress")} value={inProgressCount} tone="warning" />
        <KpiCard
          label={t("visits.kpi_total_today")}
          value={openCount + inProgressCount}
          tone="muted"
        />
        <KpiCard
          label={t("visits.kpi_avg_dwell")}
          value={`${avgDwell} ${t("visits.min")}`}
          tone="success"
        />
      </div>

      <FilterAndSearch active={status} q={searchParams.q ?? ""} t={t} />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title={t("visits.empty_title")}
          description={t("visits.empty_desc")}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((v) => {
            const label = v.patient
              ? `${v.patient.firstName} ${v.patient.lastName}`
              : "—";
            const statusLabel = t.has(`visits.status.${v.status}`)
              ? t(`visits.status.${v.status}` as never)
              : v.status;
            const roomLabel = v.currentRoom
              ? `${v.currentRoom.name} (${v.currentRoom.code})`
              : null;
            return (
              <Card
                key={v.id}
                className="border-l-4"
                style={{
                  borderLeftColor:
                    v.status === "IN_PROGRESS"
                      ? "hsl(var(--warning))"
                      : v.status === "OPEN"
                        ? "hsl(var(--info))"
                        : "hsl(var(--muted-foreground))",
                }}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="truncate text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.patient ? `HN ${v.patient.hn}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {v.checkedInAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t("visits.checked_in_at")} {formatTime(v.checkedInAt)} ·{" "}
                            {formatRelative(v.checkedInAt)}
                          </span>
                        )}
                        {v.startedAt && (
                          <span>
                            {t("visits.started_at")} {formatTime(v.startedAt)}
                          </span>
                        )}
                        {roomLabel && (
                          <span className="inline-flex items-center gap-1 rounded bg-info/10 px-1.5 py-0.5 text-info">
                            <DoorOpen className="h-3 w-3" />
                            {roomLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[v.status] ?? "secondary"}>
                      {statusLabel}
                    </Badge>
                    {v.status === "OPEN" && (
                      <StartVisitButton
                        visitId={v.id}
                        currentRoomLabel={roomLabel}
                      />
                    )}
                    <Link
                      href={`/visits/${v.id}`}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      {t("common.details")}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "success" | "info" | "warning" | "muted";
}) {
  const colour = {
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${colour}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterAndSearch({
  active,
  q,
  t,
}: {
  active: StatusFilter;
  q: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const items: Array<{ value: StatusFilter; label: string }> = [
    { value: "ALL", label: t("common.all") },
    { value: "OPEN", label: t("visits.status.OPEN") },
    { value: "IN_PROGRESS", label: t("visits.status.IN_PROGRESS") },
    { value: "COMPLETED", label: t("visits.status.COMPLETED") },
  ];
  return (
    <form className="flex flex-wrap items-center justify-between gap-3" action="/visits">
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const isActive = active === it.value;
          const params = new URLSearchParams();
          if (it.value !== "ALL") params.set("status", it.value);
          if (q) params.set("q", q);
          const href = params.toString() ? `/visits?${params}` : "/visits";
          return (
            <Link
              key={it.value}
              href={href}
              className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {active !== "ALL" && (
          <input type="hidden" name="status" value={active} />
        )}
        <input
          type="search"
          name="q"
          placeholder={t("common.search")}
          defaultValue={q}
          className="h-8 w-48 rounded-md border bg-background px-3 text-xs"
        />
      </div>
    </form>
  );
}
