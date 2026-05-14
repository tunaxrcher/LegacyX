"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDownToLine, Wrench, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/clientApi";
import { ProductPicker } from "@/components/catalog/ProductPicker";

interface Product {
  id: string;
  name: string;
  sku: string;
}

export function StockActions({ products }: { products: Product[] }) {
  return (
    <div className="flex items-center gap-2">
      <ReceiveDialog products={products} />
      <AdjustDialog products={products} />
    </div>
  );
}

function ReceiveDialog({ products }: { products: Product[] }) {
  const router = useRouter();
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [productId, setProductId] = React.useState("");
  const [qty, setQty] = React.useState("0");
  const [unitCost, setUnitCost] = React.useState("");
  const [lotNo, setLotNo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open && !productId && products[0]) setProductId(products[0].id);
  }, [open, productId, products]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/inventory/receive", {
        product_id: productId,
        qty,
        unit_cost: unitCost || undefined,
        lot_no: lotNo || undefined,
      });
      toast.success(t("receive_success"));
      setOpen(false);
      setQty("0");
      setUnitCost("");
      setLotNo("");
      router.refresh();
    } catch (err) {
      toast.error(tCommon("submit"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <ArrowDownToLine className="h-4 w-4" />
          {t("receive")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("receive")}</DialogTitle>
          <DialogDescription>{t("receive_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("product")}</Label>
            <ProductPicker
              products={products}
              value={productId}
              onChange={setProductId}
              placeholder={t("product")}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qty">{t("qty")}</Label>
              <Input
                id="qty"
                type="number"
                step="0.001"
                min="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">{t("unit_cost")}</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot">{t("lot_no")}</Label>
              <Input id="lot" value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !productId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("receive")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ products }: { products: Product[] }) {
  const router = useRouter();
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [productId, setProductId] = React.useState("");
  const [qty, setQty] = React.useState("0");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open && !productId && products[0]) setProductId(products[0].id);
  }, [open, productId, products]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/inventory/adjust", {
        product_id: productId,
        qty,
        reason,
      });
      toast.success(t("adjust_success"));
      setOpen(false);
      setQty("0");
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(tCommon("submit"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wrench className="h-4 w-4" />
          {t("adjust")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adjust")}</DialogTitle>
          <DialogDescription>{t("adjust_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("product")}</Label>
            <ProductPicker
              products={products}
              value={productId}
              onChange={setProductId}
              placeholder={t("product")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">{t("delta_qty")}</Label>
            <Input
              id="qty"
              type="number"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">{t("delta_hint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">{t("reason")}</Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !productId || reason.length < 3}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              {t("adjust")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
