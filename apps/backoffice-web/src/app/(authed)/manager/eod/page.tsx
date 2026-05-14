import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Banknote, CreditCard, ClipboardCheck, AlertTriangle } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShiftPanel, type ShiftDto } from "./ShiftPanel";
import { SettlementPanel, type UnsettledResp } from "./SettlementPanel";
import {
  ReconcilePanel,
  type ReconStockRow,
  type ReconciliationRow,
} from "./ReconcilePanel";

export const dynamic = "force-dynamic";

export default async function ManagerEodPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations("eod");

  const [shiftRes, unsettledRes, stockRes, reconRes] = await Promise.all([
    apiJson<{ data: ShiftDto | null }>(session, "/api/v1/shifts/current").catch(
      () => ({ data: null }),
    ),
    apiJson<{ data: UnsettledResp }>(session, "/api/v1/payments/unsettled").catch(
      () => ({ data: { rows: [], summary: { count: 0, total: "0" } } }),
    ),
    apiJson<{ data: ReconStockRow[] }>(session, "/api/v1/inventory/stock").catch(
      () => ({ data: [] as ReconStockRow[] }),
    ),
    apiJson<{ data: ReconciliationRow[] }>(
      session,
      "/api/v1/inventory/reconcile?limit=20",
    ).catch(() => ({ data: [] as ReconciliationRow[] })),
  ]);

  const shift = shiftRes.data;
  const unsettled = unsettledRes.data;
  const stock = stockRes.data;
  const recon = reconRes.data;

  const fmtTHB = (n: number | string) =>
    new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 2,
    }).format(typeof n === "string" ? Number(n) : n);

  const variancePending = recon.filter((r) => Number(r.variance) !== 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile
          icon={<Banknote className="h-4 w-4" />}
          label={t("kpi_shift")}
          value={shift ? t("shift_open") : t("shift_closed")}
          sub={
            shift
              ? `${t("expected")}: ${fmtTHB(shift.cashExpectedLive ?? "0")}`
              : t("kpi_shift_hint")
          }
          tone={shift ? "info" : "muted"}
        />
        <KpiTile
          icon={<CreditCard className="h-4 w-4" />}
          label={t("kpi_unsettled")}
          value={String(unsettled.summary.count)}
          sub={fmtTHB(unsettled.summary.total)}
          tone={unsettled.summary.count > 0 ? "warning" : "muted"}
        />
        <KpiTile
          icon={<ClipboardCheck className="h-4 w-4" />}
          label={t("kpi_recon_today")}
          value={String(
            recon.filter((r) => sameDay(r.createdAt, new Date())).length,
          )}
          sub={`${recon.length} ${t("kpi_recon_recent")}`}
          tone="info"
        />
        <KpiTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t("kpi_variance")}
          value={String(variancePending)}
          sub={t("kpi_variance_hint")}
          tone={variancePending > 0 ? "warning" : "muted"}
        />
      </div>

      <Tabs defaultValue="shift" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shift">{t("tab_shift")}</TabsTrigger>
          <TabsTrigger value="settle">{t("tab_settle")}</TabsTrigger>
          <TabsTrigger value="recon">{t("tab_recon")}</TabsTrigger>
        </TabsList>
        <TabsContent value="shift">
          <ShiftPanel initialShift={shift} />
        </TabsContent>
        <TabsContent value="settle">
          <SettlementPanel initialData={unsettled} />
        </TabsContent>
        <TabsContent value="recon">
          <ReconcilePanel initialStock={stock} initialRecon={recon} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function sameDay(iso: string | Date, day: Date): boolean {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return (
    d.getFullYear() === day.getFullYear()
    && d.getMonth() === day.getMonth()
    && d.getDate() === day.getDate()
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
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
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="space-y-0.5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className={`text-xl font-semibold tabular-nums ${valueColour}`}>
            {value}
          </div>
          {sub && (
            <div className="text-[11px] text-muted-foreground">{sub}</div>
          )}
        </div>
        <div className={`rounded-md p-2.5 ${bg}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}
