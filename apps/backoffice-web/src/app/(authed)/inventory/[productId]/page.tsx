import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Package } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { ReverseLedgerButton } from "./ReverseLedgerButton";

export const dynamic = "force-dynamic";

type LedgerEntry = {
  id: string;
  entryType: string;
  qty: string;
  balanceAfter: string;
  refType: string | null;
  refId: string | null;
  reversalOfId: string | null;
  lotNo: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

type ProductBalance = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
  balance: string;
};

const ENTRY_TYPE_VARIANT: Record<string, "info" | "warning" | "success" | "destructive" | "muted"> = {
  RECEIVE: "success",
  DISPENSE: "warning",
  BOM_USAGE: "warning",
  TRANSFER_IN: "info",
  TRANSFER_OUT: "info",
  ADJUSTMENT: "info",
  REVERSAL: "destructive",
  EXPIRY: "destructive",
};

export default async function ProductLedgerPage({
  params,
}: {
  params: { productId: string };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [balanceList, ledger] = await Promise.all([
    apiJson<{ data: ProductBalance[] }>(session, `/api/v1/inventory/stock`).catch(() => ({
      data: [] as ProductBalance[],
    })),
    apiJson<{ data: LedgerEntry[] }>(
      session,
      `/api/v1/inventory/stock?product_id=${params.productId}&limit=200`
    ).catch(() => ({ data: [] as LedgerEntry[] })),
  ]);
  const product = balanceList.data.find((p) => p.id === params.productId);
  if (!product) notFound();

  const reversedIds = new Set(
    ledger.data
      .filter((e) => e.entryType === "REVERSAL" && e.reversalOfId)
      .map((e) => e.reversalOfId!),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Package className="h-5 w-5" />
            {product.name}
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {product.sku} · {product.category} · {t("inventory.balance")}:{" "}
            <span className="font-semibold">{Number(product.balance).toLocaleString()}</span>{" "}
            {product.unit}
          </span>
        }
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventory">
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("inventory.qty")}</TableHead>
                <TableHead className="text-right">{t("inventory.balance")}</TableHead>
                <TableHead>{t("inventory.ref")}</TableHead>
                <TableHead>{t("common.notes")}</TableHead>
                <TableHead>{t("inventory.when")}</TableHead>
                <TableHead className="text-right">{t("inventory.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.data.map((e) => {
                const isReversal = e.entryType === "REVERSAL";
                const alreadyReversed = reversedIds.has(e.id);
                const canReverse = !isReversal && !alreadyReversed;
                return (
                  <TableRow key={e.id} className={alreadyReversed ? "text-muted-foreground" : ""}>
                    <TableCell>
                      <Badge variant={ENTRY_TYPE_VARIANT[e.entryType] ?? "secondary"}>
                        {e.entryType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(e.qty).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(e.balanceAfter).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.refType ? `${e.refType}:${e.refId?.slice(-8) ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs">
                      {e.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canReverse ? (
                        <ReverseLedgerButton ledgerId={e.id} />
                      ) : alreadyReversed ? (
                        <Badge variant="muted">{t("inventory.already_reversed")}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
