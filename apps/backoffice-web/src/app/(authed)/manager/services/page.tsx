import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  CheckCircle2,
  ImageIcon,
  LayoutGrid,
  Sparkles,
  XCircle,
} from "lucide-react";
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
import { CategoryActions } from "./CategoryActions";
import { ServiceActions } from "./ServiceActions";
import { CreateCategoryDialog } from "./CreateCategoryDialog";
import { CreateServiceDialog, type ProcedureOption } from "./CreateServiceDialog";

export const dynamic = "force-dynamic";

type ApiCategory = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  image_url: string | null;
  display_order: number;
  active: boolean;
  service_count: number;
};

type ApiService = {
  id: string;
  category_id: string;
  category: { id: string; code: string; name: string; name_th: string };
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_min: number;
  image_url: string | null;
  procedure_code: string | null;
  display_order: number;
  active: boolean;
};

function priceLabel(s: ApiService): string {
  if (s.price_from == null && s.price_to == null) return "—";
  if (s.price_from != null && s.price_to != null && s.price_from !== s.price_to) {
    return `${s.price_from.toLocaleString()} – ${s.price_to.toLocaleString()}`;
  }
  return `${(s.price_from ?? s.price_to ?? 0).toLocaleString()}`;
}

export default async function AdminServicesPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [cats, services, procedures] = await Promise.all([
    apiJson<{ data: ApiCategory[] }>(
      session,
      "/api/v1/catalog/service-categories",
    ).catch(() => ({ data: [] as ApiCategory[] })),
    apiJson<{ data: ApiService[] }>(session, "/api/v1/catalog/services").catch(
      () => ({ data: [] as ApiService[] }),
    ),
    apiJson<{ data: ProcedureOption[] }>(
      session,
      "/api/v1/catalog/procedures",
    ).catch(() => ({ data: [] as ProcedureOption[] })),
  ]);

  // Group services by category for cleaner display
  const grouped = new Map<string, ApiService[]>();
  for (const s of services.data) {
    const arr = grouped.get(s.category_id) ?? [];
    arr.push(s);
    grouped.set(s.category_id, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("manager_services.title")}
        description={t("manager_services.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <CreateCategoryDialog />
            <CreateServiceDialog
              categories={cats.data.map((c) => ({
                id: c.id,
                name: c.name,
                name_th: c.name_th,
              }))}
              procedures={procedures.data}
            />
          </div>
        }
      />

      {/* CATEGORIES table */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {t("manager_services.categories_title")}
            </h3>
            <Badge variant="muted">{cats.data.length}</Badge>
          </div>
          {cats.data.length === 0 ? (
            <EmptyState
              className="my-6"
              icon={<LayoutGrid className="h-5 w-5" />}
              title={t("manager_services.cats_empty_title")}
              description={t("manager_services.cats_empty_desc")}
              action={<CreateCategoryDialog />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">
                    {t("manager_services.image")}
                  </TableHead>
                  <TableHead>{t("manager_services.code")}</TableHead>
                  <TableHead>{t("manager_services.name")}</TableHead>
                  <TableHead>{t("manager_services.name_th")}</TableHead>
                  <TableHead className="text-right">
                    {t("manager_services.service_count")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("manager_services.order")}
                  </TableHead>
                  <TableHead>{t("manager_services.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("manager_services.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {c.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.image_url}
                          alt={c.name}
                          className="h-10 w-14 object-cover rounded-md"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-14 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm">{c.name_th}</TableCell>
                    <TableCell className="text-right text-xs">
                      <Badge variant="muted">{c.service_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.display_order}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.active ? "success" : "muted"}>
                        {c.active ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {c.active
                          ? t("manager_services.active")
                          : t("manager_services.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <CategoryActions
                        category={{
                          id: c.id,
                          code: c.code,
                          name: c.name,
                          name_th: c.name_th,
                          description: c.description,
                          description_th: c.description_th,
                          image_url: c.image_url,
                          display_order: c.display_order,
                          active: c.active,
                          service_count: c.service_count,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SERVICES grouped by category */}
      {cats.data.length === 0 ? null : services.data.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              className="my-6"
              icon={<Sparkles className="h-5 w-5" />}
              title={t("manager_services.svc_empty_title")}
              description={t("manager_services.svc_empty_desc")}
              action={
                <CreateServiceDialog
                  categories={cats.data.map((c) => ({
                    id: c.id,
                    name: c.name,
                    name_th: c.name_th,
                  }))}
                  procedures={procedures.data}
                />
              }
            />
          </CardContent>
        </Card>
      ) : (
        cats.data.map((c) => {
          const items = grouped.get(c.id) ?? [];
          if (items.length === 0) return null;
          return (
            <Card key={c.id}>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">{c.name_th}</h3>
                  <Badge variant="muted">{items.length}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">
                        {t("manager_services.image")}
                      </TableHead>
                      <TableHead>{t("manager_services.code")}</TableHead>
                      <TableHead>{t("manager_services.name_th")}</TableHead>
                      <TableHead className="text-right">
                        {t("manager_services.price")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("manager_services.duration")}
                      </TableHead>
                      <TableHead>{t("manager_services.procedure")}</TableHead>
                      <TableHead>{t("manager_services.status")}</TableHead>
                      <TableHead className="text-right">
                        {t("manager_services.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          {s.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.image_url}
                              alt={s.name}
                              className="h-10 w-14 object-cover rounded-md"
                            />
                          ) : (
                            <span className="inline-flex h-10 w-14 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.code}</TableCell>
                        <TableCell className="text-sm font-medium">{s.name_th}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {priceLabel(s)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {s.duration_min} {t("manager_services.minutes")}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {s.procedure_code ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.active ? "success" : "muted"}>
                            {s.active ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {s.active
                              ? t("manager_services.active")
                              : t("manager_services.inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <ServiceActions
                            categories={cats.data.map((cc) => ({
                              id: cc.id,
                              name: cc.name,
                              name_th: cc.name_th,
                            }))}
                            procedures={procedures.data}
                            service={s}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
