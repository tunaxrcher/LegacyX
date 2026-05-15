import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { ListSurface } from "@/components/ui/list-surface";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
  pickString,
} from "@/lib/list-params";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason: string | null;
  correlationId: string | null;
  createdAt: string;
  after: unknown;
  before: unknown;
  actor: { id: string; fullName: string; phone: string | null } | null;
};

type AuditResp = {
  data: AuditRow[];
  pagination: { total: number; page: number; perPage: number };
};

const RESOURCE_TYPE_OPTIONS = [
  "Patient",
  "Visit",
  "Appointment",
  "Order",
  "Invoice",
  "Payment",
  "EMR",
  "Procedure",
  "User",
  "Branch",
];

const ACTION_OPTIONS = [
  "patient",
  "visit",
  "appointment",
  "order",
  "payment",
  "invoice",
  "emr.sign",
  "user",
  "branch",
  "break_glass",
  "pdpa",
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const { q, page, perPage } = parseListSearchParams(searchParams, {
    defaultPerPage: 50,
    maxPerPage: 200,
  });
  const resourceType = pickString(searchParams, "resource_type");
  const resourceId = pickString(searchParams, "resource_id");
  const action = pickString(searchParams, "action");

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  if (q) apiParams.set("q", q);
  if (resourceType) apiParams.set("resource_type", resourceType);
  if (resourceId) apiParams.set("resource_id", resourceId);
  if (action) apiParams.set("action", action);

  const res = await apiJson<AuditResp>(
    session,
    `/api/v1/audit?${apiParams}`,
  ).catch(
    () =>
      ({
        data: [] as AuditRow[],
        pagination: { total: 0, page: 1, perPage },
      }) as AuditResp,
  );
  const rows = res.data;
  const total = res.pagination.total;

  const buildHref = makeListHrefBuilder("/audit", {
    q: q || undefined,
    resource_type: resourceType || undefined,
    resource_id: resourceId || undefined,
    action: action || undefined,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t("audit.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("audit.subtitle")}
      />

      <ListToolbar
        basePath="/audit"
        q={q}
        filters={{
          resource_type: resourceType,
          resource_id: resourceId,
          action,
        }}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("audit.search_placeholder")}
        selects={[
          {
            key: "resource_type",
            label: t("audit.resource_type"),
            widthClass: "w-[170px]",
            options: RESOURCE_TYPE_OPTIONS.map((v) => ({
              value: v,
              label: v,
            })),
          },
          {
            key: "action",
            label: t("audit.action_prefix"),
            widthClass: "w-[160px]",
            options: ACTION_OPTIONS.map((v) => ({ value: v, label: v })),
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
          icon: <ShieldCheck className="h-5 w-5" />,
          title: t("audit.empty_title"),
          description: t("audit.empty_desc"),
        }}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t("audit.when")}</TableHead>
              <TableHead>{t("audit.actor")}</TableHead>
              <TableHead>{t("audit.action")}</TableHead>
              <TableHead>{t("audit.resource")}</TableHead>
              <TableHead>{t("audit.reason")}</TableHead>
              <TableHead>{t("audit.correlation")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                </TableCell>
                <TableCell>
                  {r.actor ? (
                    <div className="text-sm">
                      <div className="font-medium">{r.actor.fullName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.actor.phone ?? "—"}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="outline">SYSTEM</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="info" className="font-mono text-[10px]">
                    {r.action}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <div>{r.resourceType}</div>
                  <div className="text-muted-foreground">
                    {r.resourceId.slice(-10)}
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px] truncate text-xs">
                  {r.reason ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">
                  {r.correlationId ? r.correlationId.slice(0, 10) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListSurface>
    </div>
  );
}
