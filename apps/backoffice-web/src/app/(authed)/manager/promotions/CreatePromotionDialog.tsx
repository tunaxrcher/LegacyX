"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

type PromoType = "VOUCHER" | "PACKAGE_DISCOUNT" | "BUNDLE" | "TIER";

export function CreatePromotionDialog() {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<PromoType>("VOUCHER");
  const [kind, setKind] = React.useState<"percent" | "amount">("percent");
  const [percent, setPercent] = React.useState<number>(10);
  const [amount, setAmount] = React.useState<number>(500);
  const [minSpend, setMinSpend] = React.useState<number>(0);
  const [maxUses, setMaxUses] = React.useState<number>(1);
  const [skus, setSkus] = React.useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  const [startsAt, setStartsAt] = React.useState(today);
  const [endsAt, setEndsAt] = React.useState<string>("");
  const [active, setActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const valid =
    /^[A-Z0-9_-]{2,40}$/.test(code) &&
    name.trim().length > 0 &&
    (kind === "percent" ? percent > 0 && percent <= 100 : amount > 0);

  function reset() {
    setCode("");
    setName("");
    setType("VOUCHER");
    setKind("percent");
    setPercent(10);
    setAmount(500);
    setMinSpend(0);
    setMaxUses(1);
    setSkus("");
    setStartsAt(today);
    setEndsAt("");
    setActive(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast.error(t("promotions.validation_failed"));
      return;
    }
    setBusy(true);
    try {
      const config: Record<string, unknown> = {
        kind,
        ...(kind === "percent" ? { percent } : { amount }),
      };
      if (minSpend > 0) config.min_spend = minSpend;
      if (maxUses > 0) config.max_uses_per_patient = maxUses;
      if (type === "PACKAGE_DISCOUNT" && skus.trim()) {
        config.applies_to_skus = skus
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      await clientApi.post("/api/v1/promotions", {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        config,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        active,
      });
      toast.success(t("promotions.created"));
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(t("promotions.create_failed"), {
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
          <Plus className="h-4 w-4" /> {t("promotions.create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("promotions.create")}</DialogTitle>
          <DialogDescription>{t("promotions.create_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="code">{t("promotions.code")}</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                className="font-mono"
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">{t("promotions.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as PromoType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VOUCHER">VOUCHER (code-based)</SelectItem>
                  <SelectItem value="PACKAGE_DISCOUNT">PACKAGE_DISCOUNT</SelectItem>
                  <SelectItem value="BUNDLE">BUNDLE</SelectItem>
                  <SelectItem value="TIER">TIER (placeholder)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t("promotions.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("promotions.config")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("promotions.kind")}</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "percent" | "amount")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">% off</SelectItem>
                    <SelectItem value="amount">฿ off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {kind === "percent" ? (
                <div className="space-y-2">
                  <Label htmlFor="pct">{t("promotions.percent")}</Label>
                  <Input
                    id="pct"
                    type="number"
                    min={1}
                    max={100}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="amt">{t("promotions.amount")}</Label>
                  <Input
                    id="amt"
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="min">{t("promotions.min_spend")}</Label>
                <Input
                  id="min"
                  type="number"
                  min={0}
                  value={minSpend}
                  onChange={(e) => setMinSpend(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max">{t("promotions.max_uses")}</Label>
                <Input
                  id="max"
                  type="number"
                  min={0}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                />
              </div>
            </div>
            {type === "PACKAGE_DISCOUNT" && (
              <div className="space-y-2">
                <Label htmlFor="skus">{t("promotions.applies_to_skus")}</Label>
                <Input
                  id="skus"
                  value={skus}
                  onChange={(e) => setSkus(e.target.value)}
                  placeholder="BTX-25U, BTX-50U, BTX-100U"
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("promotions.applies_to_skus_help")}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="starts">{t("promotions.starts_at")}</Label>
              <Input
                id="starts"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ends">{t("promotions.ends_at")}</Label>
              <Input
                id="ends"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                placeholder={t("promotions.no_end_date")}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <Label htmlFor="active">{t("promotions.active")}</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !valid}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("promotions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
