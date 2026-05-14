import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Tag, Calendar } from "lucide-react";
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
import { CreatePromotionDialog } from "./CreatePromotionDialog";
import { PromotionRowActions } from "./PromotionRowActions";

export const dynamic = "force-dynamic";

type Promotion = {
  id: string;
  code: string;
  name: string;
  type: "TIER" | "BUNDLE" | "PACKAGE_DISCOUNT" | "VOUCHER";
  config: Record<string, unknown>;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
};

const TYPE_VARIANT: Record<Promotion["type"], "info" | "success" | "warning" | "muted"> = {
  VOUCHER: "info",
  PACKAGE_DISCOUNT: "success",
  BUNDLE: "warning",
  TIER: "muted",
};

function formatConfig(p: Promotion): string {
  const c = p.config;
  const parts: string[] = [];
  if (c.kind === "percent" && c.percent != null) parts.push(`${c.percent}% off`);
  if (c.kind === "amount" && c.amount != null) parts.push(`฿${c.amount} off`);
  if (c.min_spend != null && Number(c.min_spend) > 0)
    parts.push(`min ฿${c.min_spend}`);
  if (c.max_uses_per_patient != null)
    parts.push(`max ${c.max_uses_per_patient}/patient`);
  if (Array.isArray(c.applies_to_skus) && c.applies_to_skus.length > 0)
    parts.push(`SKUs: ${c.applies_to_skus.join(", ")}`);
  return parts.join(" · ") || "—";
}

export default async function PromotionsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const promosRes = await apiJson<{ data: Promotion[] }>(
    session,
    "/api/v1/promotions?include_inactive=1",
  ).catch(() => ({ data: [] as Promotion[] }));
  const promos = promosRes.data ?? [];
  const activeCount = promos.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("promotions.title")}
        description={t("promotions.subtitle")}
        actions={<CreatePromotionDialog />}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Tag className="h-5 w-5 text-success" />
            <div>
              <div className="text-2xl font-bold">{activeCount}</div>
              <div className="text-xs text-muted-foreground">
                {t("promotions.active_count")}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Tag className="h-5 w-5 text-info" />
            <div>
              <div className="text-2xl font-bold">{promos.length}</div>
              <div className="text-xs text-muted-foreground">
                {t("promotions.total_count")}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="h-5 w-5 text-warning" />
            <div>
              <div className="text-2xl font-bold">
                {
                  promos.filter(
                    (p) => p.endsAt && new Date(p.endsAt) < new Date(),
                  ).length
                }
              </div>
              <div className="text-xs text-muted-foreground">
                {t("promotions.expired_count")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {promos.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<Tag className="h-5 w-5" />}
              title={t("promotions.empty_title")}
              description={t("promotions.empty_desc")}
              action={<CreatePromotionDialog />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("promotions.code")}</TableHead>
                  <TableHead>{t("promotions.name")}</TableHead>
                  <TableHead>{t("promotions.type")}</TableHead>
                  <TableHead>{t("promotions.config")}</TableHead>
                  <TableHead>{t("promotions.window")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((p) => {
                  const expired = p.endsAt && new Date(p.endsAt) < new Date();
                  return (
                    <TableRow key={p.id} className={!p.active ? "opacity-60" : ""}>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_VARIANT[p.type] ?? "muted"}>
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatConfig(p)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(p.startsAt)}
                        <br />→ {p.endsAt ? formatDateTime(p.endsAt) : "∞"}
                      </TableCell>
                      <TableCell>
                        {!p.active ? (
                          <Badge variant="muted">inactive</Badge>
                        ) : expired ? (
                          <Badge variant="warning">expired</Badge>
                        ) : (
                          <Badge variant="success">active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <PromotionRowActions promotion={p} />
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
