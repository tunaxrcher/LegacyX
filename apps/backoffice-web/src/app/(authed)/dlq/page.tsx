import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, AlertOctagon } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { ListSurface } from "@/components/ui/list-surface";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
  pickString,
} from "@/lib/list-params";
import ReplayButton from "./ReplayButton";

export const dynamic = "force-dynamic";

type Dlq = {
  id: string;
  eventName: string;
  eventId: string;
  error: string;
  attempts: number;
  status: string;
  createdAt: string;
};

type Resp = {
  data: Dlq[];
  pagination: { total: number; page: number; perPage: number };
};

const VALID_STATUSES = new Set(["NEW", "REPROCESSED", "ABANDONED"]);

export default async function DlqPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const { q, page, perPage } = parseListSearchParams(searchParams, {
    defaultPerPage: 25,
  });
  const statusInput = (pickString(searchParams, "status") || "NEW").toUpperCase();
  const status = VALID_STATUSES.has(statusInput) ? statusInput : "NEW";

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  apiParams.set("status", status);
  if (q) apiParams.set("q", q);

  const list = await apiJson<Resp>(session, `/api/admin/dlq?${apiParams}`).catch(
    () =>
      ({
        data: [] as Dlq[],
        pagination: { total: 0, page: 1, perPage },
      }) as Resp,
  );
  const items = list.data;
  const total = list.pagination.total;

  const buildHref = makeListHrefBuilder("/dlq", {
    q: q || undefined,
    status,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t("dlq.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("dlq.subtitle")}
      />

      <ListToolbar
        basePath="/dlq"
        q={q}
        filters={{ status }}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("dlq.search_placeholder")}
        selects={[
          {
            key: "status",
            label: t("dlq.filter_status"),
            widthClass: "w-[160px]",
            options: [
              { value: "NEW", label: t("dlq.status_new") },
              { value: "REPROCESSED", label: t("dlq.status_reprocessed") },
              { value: "ABANDONED", label: t("dlq.status_abandoned") },
            ],
          },
        ]}
      />

      <ListSurface
        total={total}
        page={page}
        perPage={perPage}
        getPageHref={(p) => buildHref({ page: p })}
        getPerPageHref={(pp) => buildHref({ per_page: pp, page: 1 })}
        empty={{
          icon: <CheckCircle2 className="h-5 w-5 text-success" />,
          title: t("dlq.empty_title"),
          description: t("dlq.empty_desc"),
        }}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t("dlq.event_name")}</TableHead>
              <TableHead>{t("dlq.attempts")}</TableHead>
              <TableHead>{t("dlq.last_error")}</TableHead>
              <TableHead>{t("dlq.occurred_at")}</TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4 text-destructive" />
                    <div>
                      <div className="text-sm font-medium">{d.eventName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {d.eventId}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="warning">{d.attempts}×</Badge>
                </TableCell>
                <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground">
                  {d.error}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {formatDateTime(d.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {d.status === "NEW" && <ReplayButton id={d.id} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListSurface>
    </div>
  );
}
