import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Activity, User, Clock, ArrowRight } from "lucide-react";
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
};

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "muted" | "destructive"> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export default async function VisitsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const list = await apiJson<{ data: Visit[] }>(
    session,
    "/api/v1/visits?status=OPEN&limit=50"
  ).catch(() => ({ data: [] as Visit[] }));
  const inProgress = await apiJson<{ data: Visit[] }>(
    session,
    "/api/v1/visits?status=IN_PROGRESS&limit=50"
  ).catch(() => ({ data: [] as Visit[] }));

  const all = [...inProgress.data, ...list.data];

  return (
    <div className="space-y-6">
      <PageHeader title={t("visits.title")} description={t("visits.subtitle")} />

      {all.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title={t("visits.empty_title")}
          description={t("visits.empty_desc")}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {all.map((v) => {
            const label =
              v.patient
                ? `${v.patient.firstName} ${v.patient.lastName}`
                : "—";
            const statusLabel = t.has(`visits.status.${v.status}`)
              ? t(`visits.status.${v.status}` as never)
              : v.status;
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
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[v.status] ?? "secondary"}>
                      {statusLabel}
                    </Badge>
                    {v.status === "OPEN" && <StartVisitButton visitId={v.id} />}
                    <Link
                      href={`/visits/${v.id}`}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
                    >
                      {t("common.details") ?? "Details"}
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
