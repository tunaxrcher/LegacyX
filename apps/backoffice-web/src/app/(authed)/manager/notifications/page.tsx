import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Bell, Search } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  channel: "LINE" | "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  templateCode: string;
  recipientRef: string;
  status: "PENDING" | "SENT" | "FAILED";
  providerRef: string | null;
  attempt: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
};

const STATUSES = ["PENDING", "SENT", "FAILED"] as const;
const CHANNELS = ["LINE", "SMS", "EMAIL", "PUSH", "IN_APP"] as const;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { status?: string; channel?: string; template?: string };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const params = new URLSearchParams();
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.channel) params.set("channel", searchParams.channel);
  if (searchParams.template) params.set("template", searchParams.template);
  params.set("limit", "150");

  const res = await apiJson<{
    data: NotificationRow[];
    pagination: { total: number; limit: number };
  }>(session, `/api/v1/manager/notifications?${params.toString()}`).catch(() => ({
    data: [] as NotificationRow[],
    pagination: { total: 0, limit: 150 },
  }));
  const rows = res.data;

  const counts = {
    pending: rows.filter((r) => r.status === "PENDING").length,
    sent: rows.filter((r) => r.status === "SENT").length,
    failed: rows.filter((r) => r.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.subtitle")}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("notifications.kpi_total")} value={res.pagination.total} />
        <KpiCard label={t("notifications.kpi_pending")} value={counts.pending} tone="warning" />
        <KpiCard label={t("notifications.kpi_sent")} value={counts.sent} tone="success" />
        <KpiCard label={t("notifications.kpi_failed")} value={counts.failed} tone="destructive" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <form className="grid grid-cols-1 gap-3 md:grid-cols-4" method="GET">
            <Filter label={t("notifications.f_status")} name="status" options={STATUSES} value={searchParams.status} all={t("notifications.f_all")} />
            <Filter label={t("notifications.f_channel")} name="channel" options={CHANNELS} value={searchParams.channel} all={t("notifications.f_all")} />
            <label className="space-y-1 block">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("notifications.f_template")}
              </span>
              <input
                name="template"
                defaultValue={searchParams.template ?? ""}
                placeholder="review, rebooking, ..."
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
            <button
              type="submit"
              className="self-end inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted"
            >
              <Search className="h-4 w-4" />
              {t("notifications.f_search")}
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<Bell className="h-5 w-5" />}
              title={t("notifications.empty_title")}
              description={t("notifications.empty_desc")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("notifications.col_when")}</TableHead>
                  <TableHead>{t("notifications.col_channel")}</TableHead>
                  <TableHead>{t("notifications.col_template")}</TableHead>
                  <TableHead>{t("notifications.col_recipient")}</TableHead>
                  <TableHead>{t("notifications.col_status")}</TableHead>
                  <TableHead>{t("notifications.col_attempts")}</TableHead>
                  <TableHead>{t("notifications.col_error")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {r.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.templateCode}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.recipientRef.length > 22 ? r.recipientRef.slice(0, 22) + "…" : r.recipientRef}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{r.attempt}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-destructive">
                      {r.lastError ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Filter({
  label,
  name,
  options,
  value,
  all,
}: {
  label: string;
  name: string;
  options: readonly string[];
  value?: string;
  all: string;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: NotificationRow["status"] }) {
  if (status === "SENT")
    return <Badge variant="success" className="font-mono text-[10px]">SENT</Badge>;
  if (status === "FAILED")
    return <Badge variant="destructive" className="font-mono text-[10px]">FAILED</Badge>;
  return <Badge variant="warning" className="font-mono text-[10px]">PENDING</Badge>;
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "success" | "destructive";
}) {
  const colour =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
