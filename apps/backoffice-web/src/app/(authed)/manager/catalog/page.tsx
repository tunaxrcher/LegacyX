import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Package, Syringe, Gift, Sparkles, Info } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductsPanel, type Product } from "./ProductsPanel";
import { BomsPanel, type CatalogProcedure } from "./BomsPanel";

export const dynamic = "force-dynamic";

export default async function ManagerCatalogPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations("manager_catalog");

  const [productList, catalogList] = await Promise.all([
    apiJson<{ data: Product[] }>(session, "/api/v1/catalog/products").catch(() => ({
      data: [] as Product[],
    })),
    apiJson<{ data: CatalogProcedure[] }>(
      session,
      "/api/v1/catalog?type=PROCEDURE&limit=50",
    ).catch(() => ({ data: [] as CatalogProcedure[] })),
  ]);

  const products = productList.data;
  const procedures = catalogList.data;
  const allProducts = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit }));

  // KPIs
  const countByCategory = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard icon={<Syringe className="h-4 w-4" />} label={t("medications")} value={countByCategory.MEDICATION ?? 0} color="text-emerald-600" />
        <KpiCard icon={<Package className="h-4 w-4" />} label={t("supplies")} value={countByCategory.SUPPLY ?? 0} color="text-amber-600" />
        <KpiCard icon={<Sparkles className="h-4 w-4" />} label={t("cosmetics")} value={countByCategory.COSMETIC ?? 0} color="text-rose-600" />
        <KpiCard icon={<Gift className="h-4 w-4" />} label={t("courses")} value={countByCategory.COURSE ?? 0} color="text-violet-600" />
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">{t("tab_products")}</TabsTrigger>
          <TabsTrigger value="boms">{t("tab_boms")}</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="space-y-3">
          <HelpBanner
            title={t("help_reorder_title")}
            body={t("help_reorder_body")}
          />
          <ProductsPanel initialProducts={products} />
        </TabsContent>
        <TabsContent value="boms" className="space-y-3">
          <HelpBanner
            title={t("help_bom_title")}
            body={t("help_bom_body")}
          />
          <BomsPanel procedures={procedures} allProducts={allProducts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HelpBanner({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-info/30 bg-info/5">
      <CardContent className="flex items-start gap-3 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="space-y-0.5">
          <div className="font-semibold text-info">{title}</div>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="space-y-0.5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <div className={`rounded-md bg-muted p-2.5 ${color}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

