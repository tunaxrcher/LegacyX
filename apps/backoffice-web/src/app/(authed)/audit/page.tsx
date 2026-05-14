import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, Search } from "lucide-react";
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

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { resource_type?: string; resource_id?: string; action?: string };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const params = new URLSearchParams();
  if (searchParams.resource_type) params.set("resource_type", searchParams.resource_type);
  if (searchParams.resource_id) params.set("resource_id", searchParams.resource_id);
  if (searchParams.action) params.set("action", searchParams.action);
  params.set("limit", "100");

  const res = await apiJson<{ data: AuditRow[] }>(
    session,
    `/api/v1/audit?${params.toString()}`
  ).catch(() => ({ data: [] as AuditRow[] }));
  const rows = res.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("audit.title")}
        description={t("audit.subtitle")}
      />

      {/* Filter form (GET) */}
      <Card>
        <CardContent className="py-4">
          <form className="grid grid-cols-1 gap-3 md:grid-cols-4" method="GET">
            <FilterInput
              name="resource_type"
              label={t("audit.resource_type")}
              placeholder="Visit, Order, Procedure, Invoice, Payment, ..."
              defaultValue={searchParams.resource_type}
            />
            <FilterInput
              name="resource_id"
              label={t("audit.resource_id")}
              placeholder="cl..."
              defaultValue={searchParams.resource_id}
            />
            <FilterInput
              name="action"
              label={t("audit.action_prefix")}
              placeholder="payment, emr.sign"
              defaultValue={searchParams.action}
            />
            <button
              type="submit"
              className="self-end inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted"
            >
              <Search className="h-4 w-4" />
              {t("audit.search")}
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<ShieldCheck className="h-5 w-5" />}
              title={t("audit.empty_title")}
              description={t("audit.empty_desc")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                          <div className="font-mono text-xs text-muted-foreground">{r.actor.phone ?? "—"}</div>
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
                      <div className="text-muted-foreground">{r.resourceId.slice(-10)}</div>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterInput({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </label>
  );
}
