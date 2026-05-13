"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Minus,
  Loader2,
  AlertCircle,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";
import { formatDate } from "@/lib/utils";

interface Wallet {
  id: string;
  productId: string;
  balance: number;
  expiresAt: string | null;
  product: { id: string; name: string; sku: string } | null;
}

interface CourseProduct {
  id: string;
  name: string;
  sku: string;
}

export function WalletSection({
  patientId,
  wallets,
}: {
  patientId: string;
  wallets: Wallet[];
}) {
  const t = useTranslations("wallet");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <PurchaseDialog patientId={patientId} />
      </div>

      {wallets.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={t("no_wallets")}
          action={<PurchaseDialog patientId={patientId} />}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {wallets.map((w) => {
            const expired = w.expiresAt && new Date(w.expiresAt) < new Date();
            return (
              <Card key={w.id} className="border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">
                        {w.product?.name ?? w.productId}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {w.product?.sku}
                      </CardDescription>
                    </div>
                    <Badge variant={w.balance > 0 && !expired ? "success" : "muted"}>
                      {w.balance} {t("balance").toLowerCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {w.expiresAt && (
                    <div className="flex items-center gap-1.5 text-xs">
                      {expired ? (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-destructive">Expired</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("expires")} {formatDate(w.expiresAt)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <UseDialog wallet={w} disabled={expired || w.balance < 1} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PurchaseDialog({ patientId }: { patientId: string }) {
  const router = useRouter();
  const t = useTranslations("wallet");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [products, setProducts] = React.useState<CourseProduct[]>([]);
  const [productId, setProductId] = React.useState<string>("");
  const [quantity, setQuantity] = React.useState(10);
  const [expires, setExpires] = React.useState<number | "">(365);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    clientApi
      .get<{ data: CourseProduct[] }>("/api/v1/products?category=COURSE&limit=50")
      .then((r) => {
        setProducts(r.data ?? []);
        if (!productId && r.data?.[0]) setProductId(r.data[0].id);
      })
      .catch(() => {});
  }, [open, productId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    setBusy(true);
    try {
      await clientApi.post("/api/v1/wallet/purchase", {
        patient_id: patientId,
        product_id: productId,
        quantity,
        expires_in_days: expires === "" ? undefined : Number(expires),
      });
      toast.success(t("purchase_success"));
      setOpen(false);
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
        <Button>
          <Plus className="h-4 w-4" /> {t("purchase")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("purchase")}</DialogTitle>
          <DialogDescription>เพิ่มคอร์สเข้ากระเป๋าของผู้ป่วย</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("product")}</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground">({p.sku})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qty">{t("quantity")}</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp">{t("expires_in_days")}</Label>
              <Input
                id="exp"
                type="number"
                min={1}
                value={expires}
                onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : "")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !productId}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("purchase")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UseDialog({ wallet, disabled }: { wallet: Wallet; disabled: boolean | null }) {
  const router = useRouter();
  const t = useTranslations("wallet");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [refId, setRefId] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/wallet/use", {
        wallet_id: wallet.id,
        quantity: qty,
        ref_type: "PROCEDURE",
        ref_id: refId || `manual_${Date.now()}`,
      });
      toast.success(t("use_success"));
      setOpen(false);
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
        <Button size="sm" variant="outline" disabled={!!disabled}>
          <Minus className="h-4 w-4" /> {t("use")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("use")}: {wallet.product?.name ?? wallet.productId}
          </DialogTitle>
          <DialogDescription>
            {t("balance")}: {wallet.balance}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">{t("quantity")}</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              max={wallet.balance}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref">Procedure / Visit reference</Label>
            <Input
              id="ref"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="procedure_... or visit_..."
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              {t("use")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
