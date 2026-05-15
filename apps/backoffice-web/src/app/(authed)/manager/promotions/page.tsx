import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Tag, Calendar } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { EntityCard } from "@/components/ui/entity-card";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
  pickString,
} from "@/lib/list-params";
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

type Counts = {
  total: number;
  active: number;
  inactive: number;
  expired: number;
};

type Resp = {
  data: Promotion[];
  pagination: { total: number; page: number; perPage: number };
  counts?: Counts;
};

const TYPE_VARIANT: Record<
  Promotion["type"],
  "info" | "success" | "warning" | "muted"
> = {
  VOUCHER: "info",
  PACKAGE_DISCOUNT: "success",
  BUNDLE: "warning",
  TIER: "muted",
};

const TYPE_OPTIONS = ["VOUCHER", "PACKAGE_DISCOUNT", "BUNDLE", "TIER"];

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

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const { q, view, page, perPage } = parseListSearchParams(searchParams, {
    defaultPerPage: 24,
  });
  const typeInput = pickString(searchParams, "type").toUpperCase();
  const type = TYPE_OPTIONS.includes(typeInput) ? typeInput : "";
  const statusInput = pickString(searchParams, "status").toLowerCase();
  const status = ["active", "inactive", "expired"].includes(statusInput)
    ? statusInput
    : "";

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  apiParams.set("with_counts", "1");
  if (status) {
    apiParams.set("status", status);
  } else {
    apiParams.set("include_inactive", "1");
  }
  if (q) apiParams.set("q", q);
  if (type) apiParams.set("type", type);

  const promosRes = await apiJson<Resp>(
    session,
    `/api/v1/promotions?${apiParams}`,
  ).catch(
    () =>
      ({
        data: [] as Promotion[],
        pagination: { total: 0, page: 1, perPage },
        counts: { total: 0, active: 0, inactive: 0, expired: 0 },
      }) as Resp,
  );
  const promos = promosRes.data;
  const total = promosRes.pagination.total;
  const counts: Counts =
    promosRes.counts ?? { total: 0, active: 0, inactive: 0, expired: 0 };

  const buildHref = makeListHrefBuilder("/manager/promotions", {
    q: q || undefined,
    type: type || undefined,
    status: status || undefined,
    view: view === "grid" ? "grid" : undefined,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t("promotions.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("promotions.subtitle")}
        actions={<CreatePromotionDialog />}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          icon={<Tag className="h-5 w-5 text-success" />}
          value={counts.active}
          label={t("promotions.active_count")}
        />
        <KpiCard
          icon={<Tag className="h-5 w-5 text-info" />}
          value={counts.total}
          label={t("promotions.total_count")}
        />
        <KpiCard
          icon={<Calendar className="h-5 w-5 text-warning" />}
          value={counts.expired}
          label={t("promotions.expired_count")}
        />
      </div>

      <ListToolbar
        basePath="/manager/promotions"
        q={q}
        filters={{ type, status }}
        view={view}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("promotions.search_placeholder")}
        showViewToggle
        selects={[
          {
            key: "type",
            label: t("promotions.filter_type"),
            widthClass: "w-[170px]",
            options: TYPE_OPTIONS.map((v) => ({ value: v, label: v })),
          },
          {
            key: "status",
            label: t("promotions.filter_status"),
            widthClass: "w-[150px]",
            options: [
              { value: "active", label: t("promotions.status_active") },
              { value: "inactive", label: t("promotions.status_inactive") },
              { value: "expired", label: t("promotions.status_expired") },
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
          icon: <Tag className="h-5 w-5" />,
          title: t("promotions.list_empty_title"),
          description: t("promotions.list_empty_desc"),
          action: <CreatePromotionDialog />,
        }}
      >
        {view === "grid" ? (
          <PromotionGrid promos={promos} t={t} />
        ) : (
          <PromotionTable promos={promos} t={t} />
        )}
      </ListSurface>
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function KpiCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {icon}
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PromotionStatusBadge({
  p,
  t,
}: {
  p: Promotion;
  t: Translator;
}) {
  if (!p.active)
    return <Badge variant="muted">{t("promotions.status_inactive")}</Badge>;
  const expired = p.endsAt && new Date(p.endsAt) < new Date();
  return expired ? (
    <Badge variant="warning">{t("promotions.status_expired")}</Badge>
  ) : (
    <Badge variant="success">{t("promotions.status_active")}</Badge>
  );
}

function PromotionTable({
  promos,
  t,
}: {
  promos: Promotion[];
  t: Translator;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
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
        {promos.map((p) => (
          <TableRow
            key={p.id}
            className={
              "transition-colors hover:bg-accent/40" +
              (!p.active ? " opacity-60" : "")
            }
          >
            <TableCell className="font-mono text-xs">{p.code}</TableCell>
            <TableCell>{p.name}</TableCell>
            <TableCell>
              <Badge variant={TYPE_VARIANT[p.type] ?? "muted"}>{p.type}</Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatConfig(p)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDateTime(p.startsAt)}
              <br />→ {p.endsAt ? formatDateTime(p.endsAt) : "∞"}
            </TableCell>
            <TableCell>
              <PromotionStatusBadge p={p} t={t} />
            </TableCell>
            <TableCell className="text-right">
              <PromotionRowActions promotion={p} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PromotionGrid({
  promos,
  t,
}: {
  promos: Promotion[];
  t: Translator;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {promos.map((p) => (
        <EntityCard
          key={p.id}
          align="start"
          dim={!p.active}
          actions={<PromotionRowActions promotion={p} />}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Tag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">
                {p.name}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {p.code}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={TYPE_VARIANT[p.type] ?? "muted"}>{p.type}</Badge>
            <PromotionStatusBadge p={p} t={t} />
          </div>
          <div className="line-clamp-2 text-xs text-muted-foreground">
            {formatConfig(p)}
          </div>
          <div className="mt-auto text-[10px] text-muted-foreground">
            {t("promotions.window")}: {formatDateTime(p.startsAt)} →{" "}
            {p.endsAt ? formatDateTime(p.endsAt) : "∞"}
          </div>
        </EntityCard>
      ))}
    </ul>
  );
}
