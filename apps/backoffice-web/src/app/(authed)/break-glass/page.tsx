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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
} from "@/lib/list-params";
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

type Resp = {
  data: Row[];
  pagination: { total: number; page: number; perPage: number };
};

export default async function BreakGlassPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
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

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  if (q) apiParams.set("q", q);

  const res = await apiJson<Resp>(
    session,
    `/api/v1/break-glass?${apiParams}`,
  ).catch(
    () =>
      ({
        data: [] as Row[],
        pagination: { total: 0, page: 1, perPage },
      }) as Resp,
  );
  const rows = res.data;
  const total = res.pagination.total;

  const buildHref = makeListHrefBuilder("/break-glass", {
    q: q || undefined,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t("break_glass.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("break_glass.subtitle")}
        actions={<CreateBreakGlassDialog />}
      />

      <ListToolbar
        basePath="/break-glass"
        q={q}
        filters={{}}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("break_glass.search_placeholder")}
      />

      <Card className="overflow-hidden">
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
                <TableRow className="bg-muted/40">
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
                    <TableCell className="font-mono text-xs">
                      {r.actorUserId.slice(-10)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.approvedBy.slice(-10)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div>{r.resourceType}</div>
                      <div className="text-muted-foreground">
                        {r.resourceId.slice(-10)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[360px] text-xs">
                      {r.reason}
                    </TableCell>
                  </TableRow>
                ))}
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
