import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, MapPin, Clock } from "lucide-react";
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
import { EntityCard } from "@/components/ui/entity-card";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
  pickString,
} from "@/lib/list-params";
import { CreateBranchDialog } from "./CreateBranchDialog";
import { BranchRowActions } from "./BranchRowActions";

export const dynamic = "force-dynamic";

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

type Resp = {
  data: Branch[];
  pagination: { total: number; page: number; perPage: number };
};

export default async function AdminBranchesPage({
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
  const status = pickString(searchParams, "status").toUpperCase();

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  if (q) apiParams.set("q", q);
  if (status) apiParams.set("status", status);

  const branchesRes = await apiJson<Resp>(
    session,
    `/api/v1/admin/branches?${apiParams}`,
  ).catch(
    () =>
      ({
        data: [] as Branch[],
        pagination: { total: 0, page: 1, perPage },
      }) as Resp,
  );
  const branches = branchesRes.data;
  const total = branchesRes.pagination.total;

  const buildHref = makeListHrefBuilder("/admin/branches", {
    q: q || undefined,
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
            {t("admin_branches.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("admin_branches.subtitle")}
        actions={<CreateBranchDialog />}
      />

      <ListToolbar
        basePath="/admin/branches"
        q={q}
        filters={{ status }}
        view={view}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("admin_branches.search_placeholder")}
        showViewToggle
        selects={[
          {
            key: "status",
            label: t("admin_branches.filter_status"),
            widthClass: "w-[150px]",
            options: [
              { value: "ACTIVE", label: t("admin_branches.status_active") },
              { value: "INACTIVE", label: t("admin_branches.status_inactive") },
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
          icon: <Building2 className="h-5 w-5" />,
          title: t("admin_branches.list_empty_title"),
          description: t("admin_branches.list_empty_desc"),
        }}
      >
        {view === "grid" ? (
          <BranchGrid branches={branches} t={t} />
        ) : (
          <BranchTable branches={branches} t={t} />
        )}
      </ListSurface>
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function BranchTable({
  branches,
  t,
}: {
  branches: Branch[];
  t: Translator;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead>{t("admin_branches.branch")}</TableHead>
          <TableHead>{t("admin_branches.address")}</TableHead>
          <TableHead>{t("admin_branches.timezone")}</TableHead>
          <TableHead>{t("admin_branches.status")}</TableHead>
          <TableHead>{t("admin_branches.updated_at")}</TableHead>
          <TableHead className="text-right">
            {t("admin_branches.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {branches.map((b) => (
          <TableRow key={b.id} className="transition-colors hover:bg-accent/40">
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{b.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {b.code}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {b.address ? (
                <div className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{b.address}</span>
                </div>
              ) : (
                <span className="italic">—</span>
              )}
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" /> {b.timezone}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={b.status === "ACTIVE" ? "success" : "muted"}>
                {b.status}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDateTime(b.updatedAt)}
            </TableCell>
            <TableCell className="text-right">
              <BranchRowActions branch={b} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BranchGrid({
  branches,
  t,
}: {
  branches: Branch[];
  t: Translator;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {branches.map((b) => (
        <EntityCard key={b.id} actions={<BranchRowActions branch={b} />}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-2 ring-background shadow-soft">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="truncate text-sm font-semibold leading-tight">
              {b.name}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {b.code}
            </div>
          </div>
          {b.address && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              <MapPin className="mr-1 inline h-3 w-3" />
              {b.address}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {b.timezone}
            </span>
            <Badge
              variant={b.status === "ACTIVE" ? "success" : "muted"}
              className="text-[10px]"
            >
              {b.status}
            </Badge>
          </div>
          <div className="mt-auto text-[10px] text-muted-foreground">
            {t("admin_branches.updated_at")} · {formatDateTime(b.updatedAt)}
          </div>
        </EntityCard>
      ))}
    </ul>
  );
}
