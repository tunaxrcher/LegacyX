import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  Building2,
} from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type DashboardData = {
  kpis: {
    revenueToday: number;
    revenueTodayCount: number;
    revenueMtd: number;
    revenueMtdCount: number;
    visitsToday: number;
    aiPending: number;
    lowStockCount: number;
  };
  dailyRevenue: Array<{ date: string; total: number }>;
  branchStats: Array<{
    branchId: string;
    code: string;
    name: string;
    revenue: number;
    invoiceCount: number;
  }>;
  lowStockAlerts: Array<{
    sku: string;
    name: string;
    balance: number;
    reorderLevel: number;
  }>;
};

function fmtTHB(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ManagerDashboardPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const res = await apiJson<{ data: DashboardData }>(
    session,
    "/api/v1/manager/dashboard",
  ).catch(() => null);

  if (!res) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("manager.title")}
          description={t("manager.subtitle")}
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("manager.unavailable")}
          </CardContent>
        </Card>
      </div>
    );
  }
  const { kpis, dailyRevenue, branchStats, lowStockAlerts } = res.data;

  // Compute simple "today vs yesterday" delta
  const todayBucket = dailyRevenue[dailyRevenue.length - 1]?.total ?? 0;
  const yesterdayBucket = dailyRevenue[dailyRevenue.length - 2]?.total ?? 0;
  const deltaPct =
    yesterdayBucket > 0
      ? ((todayBucket - yesterdayBucket) / yesterdayBucket) * 100
      : null;

  const maxDaily = Math.max(...dailyRevenue.map((d) => d.total), 1);
  const maxBranch = Math.max(...branchStats.map((b) => b.revenue), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("manager.title")}
        description={t("manager.subtitle")}
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={<Banknote className="h-5 w-5" />}
          label={t("manager.kpi_revenue_today")}
          value={fmtTHB(kpis.revenueToday)}
          sub={
            deltaPct !== null
              ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% ${t("manager.vs_yesterday")}`
              : t("manager.no_compare")
          }
          delta={deltaPct}
          tone="success"
        />
        <KpiTile
          icon={<TrendingUp className="h-5 w-5" />}
          label={t("manager.kpi_revenue_mtd")}
          value={fmtTHB(kpis.revenueMtd)}
          sub={`${kpis.revenueMtdCount} ${t("manager.invoices")}`}
          tone="info"
        />
        <KpiTile
          icon={<Users className="h-5 w-5" />}
          label={t("manager.kpi_visits_today")}
          value={String(kpis.visitsToday)}
          sub={t("manager.cases_checked_in")}
          tone="info"
        />
        <KpiTile
          icon={<AlertTriangle className="h-5 w-5" />}
          label={t("manager.kpi_low_stock")}
          value={String(kpis.lowStockCount)}
          sub={t("manager.items_below_reorder")}
          tone={kpis.lowStockCount > 0 ? "warning" : "muted"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Daily revenue bar chart */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{t("manager.revenue_7d")}</h3>
            </div>
            <div className="flex items-end justify-between gap-2 h-44">
              {dailyRevenue.map((d) => {
                const h = (d.total / maxDaily) * 100;
                const isToday = d.date === new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={d.date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div className="relative flex-1 w-full flex items-end">
                      <div
                        className={`w-full rounded-t-sm transition-all ${
                          isToday ? "bg-primary" : "bg-primary/30"
                        }`}
                        style={{ height: `${Math.max(2, h)}%` }}
                        title={fmtTHB(d.total)}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(d.date).toLocaleDateString("th-TH", {
                        weekday: "short",
                      })}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {d.total > 0
                        ? `${(d.total / 1000).toFixed(0)}k`
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Branch comparison */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{t("manager.branch_compare")}</h3>
              <span className="text-xs text-muted-foreground">
                ({t("manager.this_month")})
              </span>
            </div>
            {branchStats.length === 0 ? (
              <div className="py-8 text-center text-xs italic text-muted-foreground">
                {t("manager.no_branch_data")}
              </div>
            ) : (
              <div className="space-y-3">
                {branchStats.map((b) => {
                  const pct = (b.revenue / maxBranch) * 100;
                  return (
                    <div key={b.branchId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {b.name}{" "}
                          <span className="font-mono text-muted-foreground">
                            {b.code}
                          </span>
                        </span>
                        <span className="font-mono">
                          {fmtTHB(b.revenue)}{" "}
                          <span className="text-muted-foreground">
                            ({b.invoiceCount})
                          </span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-info transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low stock alerts */}
      {lowStockAlerts.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-semibold">{t("manager.low_stock_alerts")}</h3>
              <Badge variant="warning">{lowStockAlerts.length}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {lowStockAlerts.map((p) => (
                <div
                  key={p.sku}
                  className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {p.sku}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold text-warning">
                      {p.balance.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      / {p.reorderLevel}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  delta,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  tone: "success" | "info" | "warning" | "muted";
}) {
  const valueColour = {
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
    muted: "text-foreground",
  }[tone];
  const bg = {
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    warning: "bg-warning/10 text-warning",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  const subColour =
    delta === undefined || delta === null
      ? "text-muted-foreground"
      : delta >= 0
        ? "text-success"
        : "text-destructive";

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className={`text-2xl font-bold ${valueColour}`}>{value}</div>
            {sub && (
              <div className={`flex items-center gap-1 text-[10px] ${subColour}`}>
                {delta !== undefined && delta !== null && (
                  delta >= 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )
                )}
                {sub}
              </div>
            )}
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-md ${bg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
