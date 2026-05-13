import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
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
import IntakeTester from "./IntakeTester";
import { DraftDetailSheet, DraftStatusBadge, type DraftSummary } from "./DraftDetailSheet";
import { formatDateTime } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  INTAKE_SUMMARY: "ai_drafts.kind_intake",
  VOICE_TO_NOTE: "ai_drafts.kind_voice_note",
  VISION_REPORT: "ai_drafts.kind_emr",
};

export const dynamic = "force-dynamic";

export default async function AIDraftsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();
  const list = await apiJson<{ data: DraftSummary[] }>(
    session,
    "/api/v1/ai/drafts"
  ).catch(() => ({ data: [] as DraftSummary[] }));
  const drafts = list.data;
  const pending = drafts.filter((d) => d.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("ai_drafts.title")}
        description={t("ai_drafts.subtitle")}
        actions={<IntakeTester />}
      />

      {pending > 0 && (
        <Card className="border-l-4 border-l-warning bg-warning/5">
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-warning" />
              <div className="text-sm">
                <span className="font-medium">{pending}</span> drafts awaiting review
              </div>
            </div>
            <Badge variant="warning">PENDING</Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {drafts.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<Sparkles className="h-5 w-5" />}
              title={t("ai_drafts.empty_title")}
              description={t("ai_drafts.empty_desc")}
              action={<IntakeTester />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d) => {
                  const labelKey = TYPE_LABELS[d.type];
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {labelKey ? t(labelKey as never) : d.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DraftStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {d.modelName}@{d.modelVersion}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDateTime(d.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DraftDetailSheet draft={d} />
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
