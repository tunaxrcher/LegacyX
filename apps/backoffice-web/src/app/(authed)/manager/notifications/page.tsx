import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Bell } from "lucide-react";
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
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
} from "@/lib/list-params";

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

type Resp = {
  data: NotificationRow[];
  pagination: { total: number; page: number; perPage: number };
};

const VALID_STATUSES = new Set(["PENDING", "SENT", "FAILED"]);
const VALID_CHANNELS = new Set(["LINE", "SMS", "EMAIL", "PUSH", "IN_APP"]);

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    channel?: string;
    page?: string;
    per_page?: string;
  };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const { q, page, perPage } = parseListSearchParams(searchParams, {
    defaultPerPage: 25,
    maxPerPage: 200,
  });
  const statusInput = (searchParams?.status ?? "").toUpperCase();
  const channelInput = (searchParams?.channel ?? "").toUpperCase();
  const status = VALID_STATUSES.has(statusInput) ? statusInput : "";
  const channel = VALID_CHANNELS.has(channelInput) ? channelInput : "";

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  if (status) apiParams.set("status", status);
  if (channel) apiParams.set("channel", channel);
  if (q) apiParams.set("template", q);

  const res = await apiJson<Resp>(
    session,
    `/api/v1/manager/notifications?${apiParams.toString()}`,
  ).catch(
    () =>
      ({
        data: [] as NotificationRow[],
        pagination: { total: 0, page: 1, perPage },
      }) as Resp,
  );
  const rows = res.data;
  const total = res.pagination.total;

  const buildHref = makeListHrefBuilder("/manager/notifications", {
    q: q || undefined,
    status: status || undefined,
    channel: channel || undefined,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t("notifications.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("notifications.subtitle")}
      />

      <ListToolbar
        basePath="/manager/notifications"
        q={q}
        filters={{ status, channel }}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("notifications.search_placeholder")}
        selects={[
          {
            key: "status",
            label: t("notifications.f_status"),
            widthClass: "w-[140px]",
            options: [
              { value: "PENDING", label: t("notifications.status_pending") },
              { value: "SENT", label: t("notifications.status_sent") },
              { value: "FAILED", label: t("notifications.status_failed") },
            ],
          },
          {
            key: "channel",
            label: t("notifications.f_channel"),
            widthClass: "w-[140px]",
            options: ["LINE", "SMS", "EMAIL", "PUSH", "IN_APP"].map((v) => ({
              value: v,
              label: v,
            })),
          },
        ]}
      />

      <Card className="overflow-hidden">
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
                <TableRow className="bg-muted/40">
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
                    <TableCell className="font-mono text-xs">
                      {r.templateCode}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.recipientRef.length > 22
                        ? r.recipientRef.slice(0, 22) + "…"
                        : r.recipientRef}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {r.attempt}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-destructive">
                      {r.lastError ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > 0 && (
            <Pagination
              total={total}
              page={page}
              perPage={perPage}
              getPageHref={(p) => buildHref({ page: p })}
              getPerPageHref={(pp) => buildHref({ per_page: pp, page: 1 })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: NotificationRow["status"] }) {
  if (status === "SENT")
    return (
      <Badge variant="success" className="font-mono text-[10px]">
        SENT
      </Badge>
    );
  if (status === "FAILED")
    return (
      <Badge variant="destructive" className="font-mono text-[10px]">
        FAILED
      </Badge>
    );
  return (
    <Badge variant="warning" className="font-mono text-[10px]">
      PENDING
    </Badge>
  );
}
