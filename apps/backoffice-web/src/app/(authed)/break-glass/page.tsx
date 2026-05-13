import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { CreateBreakGlassDialog } from "./CreateBreakGlassDialog";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  actorUserId: string;
  approvedBy: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  createdAt: string;
};

export default async function BreakGlassPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const res = await apiJson<{ data: Row[] }>(session, "/api/v1/break-glass?limit=100").catch(
    () => ({ data: [] as Row[] }),
  );
  const rows = res.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("break_glass.title")}
        description={t("break_glass.subtitle")}
        actions={<CreateBreakGlassDialog />}
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<ShieldAlert className="h-5 w-5" />}
              title={t("break_glass.empty_title")}
              description={t("break_glass.empty_desc")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("break_glass.when")}</TableHead>
                  <TableHead>{t("break_glass.actor")}</TableHead>
                  <TableHead>{t("break_glass.approver")}</TableHead>
                  <TableHead>{t("break_glass.resource")}</TableHead>
                  <TableHead>{t("break_glass.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.actorUserId.slice(-10)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.approvedBy.slice(-10)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div>{r.resourceType}</div>
                      <div className="text-muted-foreground">{r.resourceId.slice(-10)}</div>
                    </TableCell>
                    <TableCell className="max-w-[360px] text-xs">{r.reason}</TableCell>
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
