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
import { formatDateTime } from "@/lib/utils";
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

const PDPA_ACTIONS = ["pdpa.export", "pdpa.anonymize"];

export default async function PdpaPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  // Pull recent PDPA audit rows. Audit endpoint already supports search;
  // we filter client-side here since it only returns the last 200 rows.
  const auditRes = await apiJson<{ data: AuditRow[] }>(
    session,
    "/api/v1/audit?limit=200",
  ).catch(() => ({ data: [] as AuditRow[] }));
  const all = auditRes.data ?? [];
  const pdpaRows = all.filter((r) => PDPA_ACTIONS.includes(r.action));

  const lastExport = pdpaRows.find((r) => r.action === "pdpa.export");
  const lastAnonymize = pdpaRows.find((r) => r.action === "pdpa.anonymize");

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
              <span className="text-muted-foreground">{t("pdpa.no_history")}</span>
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
              <span className="text-muted-foreground">{t("pdpa.no_history")}</span>
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
          {/* `roles` drives the lock on the irreversible `Anonymise` button —
              MANAGER can export but only ADMIN may anonymise. The server still
              enforces this via ABAC; the prop is purely UX. */}
          <PdpaActionBar roles={session.roles ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t("pdpa.history_heading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pdpaRows.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<ScrollText className="h-5 w-5" />}
              title={t("pdpa.no_history")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                    typeof (r.after as Record<string, unknown> | null)?.reason === "string"
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
                            r.action === "pdpa.anonymize" ? "destructive" : "info"
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
        </CardContent>
      </Card>
    </div>
  );
}
