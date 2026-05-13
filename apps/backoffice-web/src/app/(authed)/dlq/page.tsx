import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, AlertOctagon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import ReplayButton from "./ReplayButton";

type Dlq = {
  id: string;
  eventName: string;
  eventId: string;
  error: string;
  attempts: number;
  status: string;
  createdAt: string;
};

export const dynamic = "force-dynamic";

export default async function DlqPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();
  const list = await apiJson<{ data: Dlq[] }>(session, "/api/admin/dlq").catch(
    () => ({ data: [] as Dlq[] })
  );
  const items = list.data;

  return (
    <div className="space-y-6">
      <PageHeader title={t("dlq.title")} description={t("dlq.subtitle")} />

      {items.length === 0 ? (
        <EmptyState
          className="bg-success/5"
          icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          title={t("dlq.empty_title")}
          description={t("dlq.empty_desc")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dlq.event_name")}</TableHead>
                  <TableHead>{t("dlq.attempts")}</TableHead>
                  <TableHead>{t("dlq.last_error")}</TableHead>
                  <TableHead>{t("dlq.occurred_at")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                      <ReplayButton id={d.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
