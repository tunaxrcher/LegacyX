import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, ScrollText, History, FileDown, UserX } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PdpaActionBar } from "./PdpaActionBar";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: { id: string; fullName: string; phone: string | null } | null;
};

type Resp = {
  data: AuditRow[];
  pagination: { total: number; page: number; perPage: number };
};

const VALID_ACTIONS = new Set(["pdpa.export", "pdpa.anonymize"]);

export default async function PdpaPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    action?: string;
    page?: string;
    per_page?: string;
  };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const { q, page, perPage } = parseListSearchParams(searchParams, {
    defaultPerPage: 25,
  });
  const actionInput = searchParams?.action ?? "";
  const actionFilter = VALID_ACTIONS.has(actionInput) ? actionInput : "";
  // If no explicit action filter, default to all pdpa.* actions.
  const apiAction = actionFilter || "pdpa";

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  apiParams.set("action", apiAction);
  if (q) apiParams.set("q", q);

  // The audit list endpoint also returns top-of-the-stack records, which the
  // KPI cards use; we fetch the unfiltered head of pdpa rows separately just
  // for those.
  const [historyRes, latestRes] = await Promise.all([
    apiJson<Resp>(session, `/api/v1/audit?${apiParams.toString()}`).catch(
      () =>
        ({
          data: [] as AuditRow[],
          pagination: { total: 0, page: 1, perPage },
        }) as Resp,
    ),
    apiJson<Resp>(session, `/api/v1/audit?action=pdpa&per_page=10`).catch(
      () =>
        ({
          data: [] as AuditRow[],
          pagination: { total: 0, page: 1, perPage: 10 },
        }) as Resp,
    ),
  ]);
  const pdpaRows = historyRes.data;
  const total = historyRes.pagination.total;
  const latest = latestRes.data;

  const lastExport = latest.find((r) => r.action === "pdpa.export");
  const lastAnonymize = latest.find((r) => r.action === "pdpa.anonymize");

  const buildHref = makeListHrefBuilder("/manager/pdpa", {
    q: q || undefined,
    action: actionFilter || undefined,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pdpa.title")}
        description={t("pdpa.subtitle")}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-success" />
              {t("pdpa.policy_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>{t("pdpa.policy_line_1")}</p>
            <p>{t("pdpa.policy_line_2")}</p>
            <p>{t("pdpa.policy_line_3")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileDown className="h-4 w-4 text-info" />
              {t("pdpa.last_export")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            {lastExport ? (
              <>
                <div className="font-mono">{lastExport.resourceId}</div>
                <div className="text-muted-foreground">
                  {formatDateTime(lastExport.createdAt)}
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("pdpa.no_history")}
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserX className="h-4 w-4 text-destructive" />
              {t("pdpa.last_anonymize")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            {lastAnonymize ? (
              <>
                <div className="font-mono">{lastAnonymize.resourceId}</div>
                <div className="text-muted-foreground">
                  {formatDateTime(lastAnonymize.createdAt)}
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("pdpa.no_history")}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" />
            {t("pdpa.run_action_heading")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PdpaActionBar roles={session.roles ?? []} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t("pdpa.history_heading")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 pb-3">
            <ListToolbar
              basePath="/manager/pdpa"
              q={q}
              filters={{ action: actionFilter }}
              perPage={perPage}
              searchKey="q"
              searchPlaceholder={t("audit.search_placeholder")}
              selects={[
                {
                  key: "action",
                  label: t("pdpa.filter_action"),
                  widthClass: "w-[170px]",
                  options: [
                    { value: "pdpa.export", label: t("pdpa.action_export") },
                    {
                      value: "pdpa.anonymize",
                      label: t("pdpa.action_anonymize"),
                    },
                  ],
                },
              ]}
            />
          </div>
          {pdpaRows.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<ScrollText className="h-5 w-5" />}
              title={t("pdpa.no_history")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("common.created_at")}</TableHead>
                  <TableHead>{t("pdpa.action")}</TableHead>
                  <TableHead>{t("pdpa.patient_id")}</TableHead>
                  <TableHead>{t("audit.actor")}</TableHead>
                  <TableHead>{t("pdpa.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pdpaRows.map((r) => {
                  const reason =
                    typeof (r.after as Record<string, unknown> | null)?.reason ===
                    "string"
                      ? String((r.after as Record<string, unknown>).reason)
                      : "—";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.action === "pdpa.anonymize"
                              ? "destructive"
                              : "info"
                          }
                        >
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.resourceId}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.actor?.fullName ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs">
                        {reason}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
