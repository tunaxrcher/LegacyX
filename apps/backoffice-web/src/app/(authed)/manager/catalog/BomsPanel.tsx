"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Syringe, Pencil, Plus, Loader2, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

export interface CatalogProcedure {
  refId: string; // PROC_BTX_FACE
  code: string;
  name: string;
  defaultPrice: number;
  itemType: "PROCEDURE" | "PRODUCT" | "MEDICATION" | "COURSE";
  unit?: string;
}

interface SimpleProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
}

interface BomItemRow {
  productId: string;
  productName: string;
  productSku: string;
  qty: string;
  unit: string;
}

interface BomResponse {
  id: string;
  version: number;
  ownerRef: string;
  active: boolean;
  items: Array<{
    componentProductId: string;
    qty: string;
    unit: string;
    component: { id: string; sku: string; name: string; unit: string; category: string };
  }>;
}

export function BomsPanel({
  procedures,
  allProducts,
}: {
  procedures: CatalogProcedure[];
  allProducts: SimpleProduct[];
}) {
  const t = useTranslations("manager_catalog");

  return (
    <Card>
      <CardContent className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("procedure")}</TableHead>
              <TableHead>{t("procedure_code")}</TableHead>
              <TableHead className="text-right">{t("default_price")}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {procedures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No procedures in catalog
                </TableCell>
              </TableRow>
            ) : (
              procedures.map((p) => (
                <TableRow key={p.refId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Syringe className="h-3.5 w-3.5 text-rose-600" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.code}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ฿ {p.defaultPrice.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <BomEditorDialog procedure={p} allProducts={allProducts} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BomEditorDialog({
  procedure,
  allProducts,
}: {
  procedure: CatalogProcedure;
  allProducts: SimpleProduct[];
}) {
  const router = useRouter();
  const t = useTranslations("manager_catalog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [bom, setBom] = React.useState<BomResponse | null>(null);
  const [items, setItems] = React.useState<BomItemRow[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await clientApi.get<{ data: BomResponse | null }>(
        `/api/v1/catalog/boms/${procedure.refId}`,
      );
      setBom(res.data);
      setItems(
        (res.data?.items ?? []).map((it) => ({
          productId: it.componentProductId,
          productName: it.component.name,
          productSku: it.component.sku,
          qty: String(it.qty),
          unit: it.unit,
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function addItem() {
    // Pick first product not already in list
    const available = allProducts.find((p) => !items.some((it) => it.productId === p.id));
    if (!available) {
      toast.error("All products already added");
      return;
    }
    setItems([
      ...items,
      {
        productId: available.id,
        productName: available.name,
        productSku: available.sku,
        qty: "1",
        unit: available.unit,
      },
    ]);
  }

  function updateItem(index: number, patch: Partial<BomItemRow>) {
    setItems((arr) => arr.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setItems((arr) => arr.filter((_, i) => i !== index));
  }

  function pickProduct(index: number, productId: string) {
    const p = allProducts.find((x) => x.id === productId);
    if (!p) return;
    updateItem(index, {
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      unit: p.unit,
    });
  }

  async function save() {
    if (items.some((it) => !it.productId || Number(it.qty) <= 0)) {
      toast.error(t("bom_validation"));
      return;
    }
    setBusy(true);
    try {
      await clientApi.put(`/api/v1/catalog/boms/${procedure.refId}`, {
        items: items.map((it) => ({
          product_id: it.productId,
          qty: it.qty,
          unit: it.unit,
        })),
      });
      toast.success(t("bom_saved"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("bom_save_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) load();
        else {
          setBom(null);
          setItems([]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          {t("edit_bom")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Syringe className="h-4 w-4 text-rose-600" />
            {procedure.name}
            {bom && <Badge variant="secondary">v{bom.version}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {t("bom_dialog_desc")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                {t("bom_empty")}
              </div>
            ) : (
              <ul className="space-y-2">
                {items.map((it, idx) => (
                  <li
                    key={idx}
                    className="grid grid-cols-12 items-end gap-2 rounded-md border p-2.5"
                  >
                    <div className="col-span-7">
                      <Label className="text-xs">{t("product")}</Label>
                      <Select
                        value={it.productId}
                        onValueChange={(v) => pickProduct(idx, v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {allProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-mono text-xs">{p.sku}</span>
                                <span>·</span>
                                <span>{p.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{t("qty")}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={it.qty}
                        onChange={(e) => updateItem(idx, { qty: e.target.value })}
                        className="text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">{t("unit")}</Label>
                      <Input
                        value={it.unit}
                        onChange={(e) => updateItem(idx, { unit: e.target.value })}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              {t("add_material")}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button onClick={save} disabled={busy || loading}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {tCommon("save") ?? "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
