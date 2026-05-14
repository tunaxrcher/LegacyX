"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Search,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { clientApi } from "@/lib/clientApi";
import { cn } from "@/lib/utils";

export interface ReconStockRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
  balance: string;
  lastMovementAt: string | null;
}

export interface ReconciliationRow {
  id: string;
  productId: string;
  systemQty: string;
  countedQty: string;
  variance: string;
  reason: string | null;
  overrideId: string | null;
  performedBy: string;
  createdAt: string;
  product: { id: string; sku: string; name: string; unit: string } | null;
}

type CountedMap = Record<string, string>;

export function ReconcilePanel({
  initialStock,
  initialRecon,
}: {
  initialStock: ReconStockRow[];
  initialRecon: ReconciliationRow[];
}) {
  const t = useTranslations("eod");
  const router = useRouter();
  const [stock, setStock] = React.useState(initialStock);
  const [recon, setRecon] = React.useState(initialRecon);
  const [q, setQ] = React.useState("");
  const [counted, setCounted] = React.useState<CountedMap>({});
  const [overrideId, setOverrideId] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const filtered = stock.filter((r) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      r.name.toLowerCase().includes(needle) ||
      r.sku.toLowerCase().includes(needle)
    );
  });

  const dirtyItems = stock
    .filter((r) => counted[r.id] !== undefined && counted[r.id] !== "")
    .map((r) => ({
      product_id: r.id,
      counted_qty: counted[r.id]!,
      systemQty: r.balance,
      variance: (Number(counted[r.id]) - Number(r.balance)).toFixed(3),
      sku: r.sku,
      name: r.name,
      unit: r.unit,
    }));

  const dirtyCount = dirtyItems.length;
  const varianceCount = dirtyItems.filter((d) => Number(d.variance) !== 0).length;

  async function reload() {
    try {
      const [s, r] = await Promise.all([
        clientApi.get<{ data: ReconStockRow[] }>("/api/v1/inventory/stock"),
        clientApi.get<{ data: ReconciliationRow[] }>(
          "/api/v1/inventory/reconcile?limit=20",
        ),
      ]);
      setStock(s.data);
      setRecon(r.data);
      setCounted({});
      setOverrideId("");
      setNotes("");
      router.refresh();
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{t("recon_count_title")}</div>
            <Badge variant="outline">{filtered.length}</Badge>
            <div className="flex-1" />
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("recon_search")}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{t("recon_sku")}</th>
                  <th className="px-3 py-2 text-left">{t("recon_name")}</th>
                  <th className="px-3 py-2 text-right">{t("recon_system")}</th>
                  <th className="px-3 py-2 text-right">{t("recon_counted")}</th>
                  <th className="px-3 py-2 text-right">{t("recon_variance")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      {t("recon_no_products")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const cnt = counted[r.id] ?? "";
                    const variance =
                      cnt === ""
                        ? null
                        : (Number(cnt) - Number(r.balance)).toFixed(3);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2 font-mono">{r.sku}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {r.category} · {r.unit}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {Number(r.balance).toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                          })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={cnt}
                            onChange={(e) =>
                              setCounted({ ...counted, [r.id]: e.target.value })
                            }
                            placeholder={r.balance}
                            className="ml-auto w-24 text-right font-mono"
                          />
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-mono tabular-nums",
                            variance === null && "text-muted-foreground",
                            variance !== null
                              && Number(variance) === 0
                              && "text-success",
                            variance !== null
                              && Number(variance) < 0
                              && "text-warning",
                            variance !== null
                              && Number(variance) > 0
                              && "text-info",
                          )}
                        >
                          {variance === null
                            ? "—"
                            : Number(variance) > 0
                              ? `+${Number(variance).toLocaleString()}`
                              : Number(variance).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {dirtyCount > 0 && (
            <div
              className={cn(
                "flex items-center justify-between rounded-md border p-3",
                varianceCount > 0
                  ? "border-warning/40 bg-warning/5"
                  : "border-success/40 bg-success/5",
              )}
            >
              <div className="space-y-0.5 text-sm">
                <div className="font-medium">
                  {dirtyCount} {t("recon_items_counted")} · {varianceCount}{" "}
                  {t("recon_items_variance")}
                </div>
                {varianceCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-warning">
                    <ShieldAlert className="h-3 w-3" />
                    {t("recon_override_required")}
                  </div>
                )}
              </div>
              <ReconcileDialog
                items={dirtyItems}
                hasVariance={varianceCount > 0}
                overrideId={overrideId}
                setOverrideId={setOverrideId}
                notes={notes}
                setNotes={setNotes}
                onSubmitted={reload}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h4 className="text-sm font-semibold">{t("recent_recon")}</h4>
          {recon.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
              {t("recon_empty")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("recon_when")}</th>
                    <th className="px-3 py-2 text-left">{t("recon_product")}</th>
                    <th className="px-3 py-2 text-right">{t("recon_system")}</th>
                    <th className="px-3 py-2 text-right">{t("recon_counted")}</th>
                    <th className="px-3 py-2 text-right">{t("recon_variance")}</th>
                    <th className="px-3 py-2 text-left">{t("recon_override")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        {new Date(r.createdAt).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {r.product?.name ?? "—"}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {r.product?.sku ?? r.productId.slice(-8)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {Number(r.systemQty).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {Number(r.countedQty).toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono tabular-nums",
                          Number(r.variance) === 0 && "text-success",
                          Number(r.variance) < 0 && "text-warning",
                          Number(r.variance) > 0 && "text-info",
                        )}
                      >
                        {Number(r.variance) > 0
                          ? `+${Number(r.variance).toLocaleString()}`
                          : Number(r.variance).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {r.overrideId ? (
                          <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                            <ShieldAlert className="h-2.5 w-2.5" />
                            {r.overrideId.slice(-8)}
                          </span>
                        ) : Number(r.variance) === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-success">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {t("recon_match")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReconcileDialog({
  items,
  hasVariance,
  overrideId,
  setOverrideId,
  notes,
  setNotes,
  onSubmitted,
}: {
  items: Array<{
    product_id: string;
    counted_qty: string;
    systemQty: string;
    variance: string;
    sku: string;
    name: string;
    unit: string;
  }>;
  hasVariance: boolean;
  overrideId: string;
  setOverrideId: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onSubmitted: () => void;
}) {
  const t = useTranslations("eod");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hasVariance && !overrideId.trim()) {
      toast.error(t("recon_override_required"));
      return;
    }
    setBusy(true);
    try {
      await clientApi.post("/api/v1/inventory/reconcile", {
        items: items.map((i) => ({
          product_id: i.product_id,
          counted_qty: i.counted_qty,
        })),
        override_id: overrideId.trim() || undefined,
        notes: notes || undefined,
      });
      toast.success(t("recon_success", { n: items.length }));
      setOpen(false);
      onSubmitted();
    } catch (err) {
      toast.error(t("recon_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={hasVariance ? "default" : "default"}>
          <ClipboardCheck className="h-4 w-4" />
          {t("recon_submit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("recon_confirm_title")}</DialogTitle>
          <DialogDescription>{t("recon_confirm_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="max-h-64 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">{t("recon_sku")}</th>
                  <th className="px-2 py-1.5 text-right">{t("recon_system")}</th>
                  <th className="px-2 py-1.5 text-right">{t("recon_counted")}</th>
                  <th className="px-2 py-1.5 text-right">{t("recon_variance")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.product_id} className="border-t">
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[11px]">{it.sku}</div>
                      <div className="text-[10px] text-muted-foreground">{it.name}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {Number(it.systemQty).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {Number(it.counted_qty).toLocaleString()}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right font-mono tabular-nums",
                        Number(it.variance) === 0 && "text-success",
                        Number(it.variance) < 0 && "text-warning",
                        Number(it.variance) > 0 && "text-info",
                      )}
                    >
                      {Number(it.variance) > 0
                        ? `+${Number(it.variance)}`
                        : Number(it.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasVariance && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-xs text-warning">
                <ShieldAlert className="h-3 w-3" />
                {t("recon_override_label")}
              </Label>
              <Input
                required
                value={overrideId}
                onChange={(e) => setOverrideId(e.target.value)}
                placeholder="ovr_..."
                className="font-mono"
              />
              <div className="flex items-start gap-1 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {t("recon_override_hint")}{" "}
                  <a href="/break-glass" className="underline">
                    /break-glass
                  </a>
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">{t("notes_optional")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <ClipboardCheck className="h-4 w-4" />
              {t("recon_apply", { n: items.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
