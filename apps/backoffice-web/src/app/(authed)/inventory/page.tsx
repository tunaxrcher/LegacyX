import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Package, AlertTriangle, Boxes, TrendingDown } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StockActions } from "./StockActions";
import { InventoryList, type StockRow } from "./InventoryList";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const list = await apiJson<{ data: StockRow[] }>(
    session,
    "/api/v1/inventory/stock",
  ).catch(() => ({ data: [] as StockRow[] }));
  const rows = list.data;

  const lowStock = rows.filter(
    (r) => Number(r.balance) <= r.reorderLevel && r.reorderLevel > 0,
  );
  const outOfStock = rows.filter((r) => Number(r.balance) <= 0);
  const totalItems = rows.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inventory.title")}
        description={t("inventory.subtitle")}
        actions={
          <StockActions
            products={rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku }))}
          />
        }
      />

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={<Boxes className="h-4 w-4" />}
          label={t("inventory.total_items")}
          value={totalItems}
          color="text-primary"
        />
        <Kpi
          icon={<TrendingDown className="h-4 w-4" />}
          label={t("inventory.low_stock")}
          value={lowStock.length}
          color={lowStock.length > 0 ? "text-warning" : "text-muted-foreground"}
        />
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t("inventory.out_of_stock")}
          value={outOfStock.length}
          color={outOfStock.length > 0 ? "text-destructive" : "text-muted-foreground"}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              className="m-6"
              icon={<Package className="h-5 w-5" />}
              title={t("inventory.empty_title")}
              description={t("inventory.empty_desc")}
            />
          </CardContent>
        </Card>
      ) : (
        <InventoryList rows={rows} />
      )}
    </div>
  );
}

function Kpi({
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
          <div className={`text-2xl font-semibold tabular-nums ${color}`}>
            {value}
          </div>
        </div>
        <div className={`rounded-md bg-muted p-2.5 ${color}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}
