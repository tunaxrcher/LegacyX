import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  CalendarDays,
  Sparkles,
  AlertOctagon,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Plus,
  FileSignature,
} from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatRelative } from "@/lib/utils";

type Health = { status: string; checks: Record<string, { ok: boolean; ms?: number }> };
type ApptItem = { id: string; status: string; scheduledAt: string };
type ApptList = { data: ApptItem[]; pagination: { total: number } };
type DlqItem = { id: string; eventName: string; firstFailedAt: string };
type DlqList = { data: DlqItem[] };
type DraftItem = { id: string; kind: string; status: string; createdAt: string };
type DraftList = { data: DraftItem[] };

function startOfDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfDayISO() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [health, apptsAll, apptsToday, dlq, drafts] = await Promise.all([
    apiJson<Health>(session, "/api/health").catch(() => null),
    apiJson<ApptList>(session, "/api/v1/appointments?perPage=1").catch(() => null),
    apiJson<ApptList>(
      session,
      `/api/v1/appointments?from=${encodeURIComponent(
        startOfDayISO()
      )}&to=${encodeURIComponent(endOfDayISO())}&perPage=20`
    ).catch(() => null),
    apiJson<DlqList>(session, "/api/admin/dlq").catch(() => null),
    apiJson<DraftList>(session, "/api/v1/ai/drafts").catch(() => null),
  ]);

  const apptTodayCount = apptsToday?.data?.length ?? 0;
  const apptTotal = apptsAll?.pagination?.total ?? 0;
  const dlqCount = dlq?.data?.length ?? 0;
  const draftPending = drafts?.data?.filter((d) => d.status === "PENDING").length ?? 0;
  const apiOk = health?.status === "ok";

  const kpis = [
    {
      key: "kpi_appointments_today",
      value: apptTodayCount,
      icon: CalendarDays,
      tone: "info" as const,
      href: "/appointments",
    },
    {
      key: "kpi_appointments_total",
      value: apptTotal,
      icon: Activity,
      tone: "muted" as const,
      href: "/appointments",
    },
    {
      key: "kpi_ai_drafts_pending",
      value: draftPending,
      icon: Sparkles,
      tone: draftPending > 0 ? ("warning" as const) : ("muted" as const),
      href: "/ai-drafts",
    },
    {
      key: "kpi_dlq",
      value: dlqCount,
      icon: AlertOctagon,
      tone: dlqCount > 0 ? ("destructive" as const) : ("muted" as const),
      href: "/dlq",
    },
  ];

  const upcoming = (apptsToday?.data ?? [])
    .slice()
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t("dashboard.title")}`}
        description={`${t("dashboard.subtitle")} · ${session.branchName ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/ai-drafts">
                <Sparkles className="h-4 w-4" /> {t("dashboard.quick_review_drafts")}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/appointments">
                <Plus className="h-4 w-4" /> {t("dashboard.quick_book")}
              </Link>
            </Button>
          </>
        }
      />

      {/* API health banner */}
      <Card
        className={cn(
          "border-l-4",
          apiOk ? "border-l-success" : "border-l-destructive"
        )}
      >
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            {apiOk ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <CircleAlert className="h-5 w-5 text-destructive" />
            )}
            <div>
              <div className="text-sm font-medium">
                API {apiOk ? "healthy" : "unreachable"}
              </div>
              <div className="text-xs text-muted-foreground">
                {health
                  ? `db ${health.checks?.db?.ms ?? "—"} ms`
                  : "Cannot connect to API server"}
              </div>
            </div>
          </div>
          <Badge variant={apiOk ? "success" : "destructive"}>{health?.status ?? "down"}</Badge>
        </CardContent>
      </Card>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.key} href={k.href}>
              <Card className="group relative h-full overflow-hidden transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(`dashboard.${k.key}`)}
                  </CardTitle>
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md",
                      k.tone === "info" && "bg-info/10 text-info",
                      k.tone === "warning" && "bg-warning/15 text-warning",
                      k.tone === "destructive" && "bg-destructive/10 text-destructive",
                      k.tone === "muted" && "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tabular-nums">{k.value}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {t("common.view_all")} <ArrowUpRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's appointments */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{t("appointments.today_view")}</CardTitle>
              <CardDescription>{t("appointments.subtitle")}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/appointments">
                {t("common.view_all")} <ArrowUpRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                {t("appointments.empty_title")}
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">
                          {new Intl.DateTimeFormat("th-TH", {
                            timeStyle: "short",
                          }).format(new Date(a.scheduledAt))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatRelative(a.scheduledAt)}
                        </div>
                      </div>
                    </div>
                    <Badge variant={a.status === "CHECKED_IN" ? "info" : "secondary"}>
                      {t.has(`appointments.status.${a.status}`)
                        ? t(`appointments.status.${a.status}` as never)
                        : a.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.quick_actions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/appointments">
                <Plus className="h-4 w-4" /> {t("dashboard.quick_book")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/emr/sign">
                <FileSignature className="h-4 w-4" /> {t("dashboard.quick_sign_emr")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/ai-drafts">
                <Sparkles className="h-4 w-4" /> {t("dashboard.quick_review_drafts")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
