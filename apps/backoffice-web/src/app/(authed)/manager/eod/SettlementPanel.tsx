"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CreditCard,
  CheckSquare,
  Square,
  Loader2,
  Banknote,
  Receipt,
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

export interface UnsettledPayment {
  id: string;
  invoiceId: string;
  method: string;
  amount: string;
  state: string;
  completedAt: string | null;
  invoice: { id: string; number: string; patientId: string; total: string } | null;
}

export interface UnsettledResp {
  rows: UnsettledPayment[];
  summary: { count: number; total: string };
}

const fmtTHB = (n: number | string) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(typeof n === "string" ? Number(n) : n);

const METHOD_BADGE: Record<string, string> = {
  CASH: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  CARD: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  QR_PROMPTPAY: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  TRANSFER: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  WALLET: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  OTHER: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300",
};

export function SettlementPanel({ initialData }: { initialData: UnsettledResp }) {
  const t = useTranslations("eod");
  const router = useRouter();
  const [data, setData] = React.useState(initialData);
  const [methodFilter, setMethodFilter] = React.useState<string>("ALL");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const filtered =
    methodFilter === "ALL"
      ? data.rows
      : data.rows.filter((r) => r.method === methodFilter);

  const allMethods = Array.from(new Set(data.rows.map((r) => r.method)));
  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + Number(r.amount), 0);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (filtered.every((r) => selected.has(r.id))) {
      const next = new Set(selected);
      for (const r of filtered) next.delete(r.id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const r of filtered) next.add(r.id);
      setSelected(next);
    }
  }

  async function reload() {
    try {
      const r = await clientApi.get<{ data: UnsettledResp }>(
        "/api/v1/payments/unsettled",
      );
      setData(r.data);
      setSelected(new Set());
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
            <div className="text-sm font-semibold">{t("unsettled_title")}</div>
            <Badge variant="secondary">
              {data.summary.count} · {fmtTHB(data.summary.total)}
            </Badge>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={methodFilter === "ALL"}
                onClick={() => setMethodFilter("ALL")}
                label={t("all_methods")}
              />
              {allMethods.map((m) => (
                <Chip
                  key={m}
                  active={methodFilter === m}
                  onClick={() => setMethodFilter(m)}
                  label={m}
                />
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              <Banknote className="mx-auto mb-2 h-5 w-5" />
              {t("no_unsettled")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <button onClick={toggleAll} className="flex items-center">
                        {filtered.every((r) => selected.has(r.id)) && filtered.length > 0 ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">{t("invoice")}</th>
                    <th className="px-3 py-2 text-left">{t("method")}</th>
                    <th className="px-3 py-2 text-left">{t("completed_at")}</th>
                    <th className="px-3 py-2 text-right">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isSel = selected.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "cursor-pointer border-t hover:bg-muted/30",
                          isSel && "bg-primary/5",
                        )}
                        onClick={() => toggle(r.id)}
                      >
                        <td className="px-3 py-2">
                          {isSel ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {r.invoice?.number ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-[10px] font-medium",
                              METHOD_BADGE[r.method] ?? METHOD_BADGE.OTHER,
                            )}
                          >
                            {r.method}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.completedAt
                            ? new Date(r.completedAt).toLocaleString("th-TH", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {fmtTHB(r.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedRows.length > 0 && (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="text-sm">
                <span className="font-medium">{selectedRows.length}</span>{" "}
                {t("selected")} · {fmtTHB(selectedTotal)}
              </div>
              <SettleDialog
                paymentIds={Array.from(selected)}
                total={selectedTotal}
                onSettled={reload}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function SettleDialog({
  paymentIds,
  total,
  onSettled,
}: {
  paymentIds: string[];
  total: number;
  onSettled: () => void;
}) {
  const t = useTranslations("eod");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [batchId, setBatchId] = React.useState("");
  const [feeTotal, setFeeTotal] = React.useState("0");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open && !batchId) {
      const today = new Date();
      const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
        today.getDate(),
      ).padStart(2, "0")}`;
      setBatchId(`SETTLE-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
    }
  }, [open, batchId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Distribute total fees evenly across selected payments
      const feeNum = Number(feeTotal) || 0;
      const feePer = feeNum > 0 ? feeNum / paymentIds.length : 0;
      const fees = feeNum > 0
        ? paymentIds.map((id) => ({ payment_id: id, fee_amount: feePer.toFixed(2) }))
        : undefined;
      await clientApi.post("/api/v1/payments/settle-batch", {
        gateway_settlement_id: batchId,
        payment_ids: paymentIds,
        fees,
        notes: notes || undefined,
      });
      toast.success(t("settle_success", { n: paymentIds.length }));
      setOpen(false);
      setBatchId("");
      setFeeTotal("0");
      setNotes("");
      onSettled();
    } catch (err) {
      toast.error(t("settle_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard className="h-4 w-4" />
          {t("settle_now")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settle_title")}</DialogTitle>
          <DialogDescription>{t("settle_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>{t("batch_total")}</span>
              <span>{paymentIds.length} payments</span>
            </div>
            <div className="text-2xl font-semibold tabular-nums">{fmtTHB(total)}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("batch_ref")}</Label>
            <Input
              required
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="font-mono"
              placeholder="STRIPE-tr_abc123"
            />
            <div className="text-[11px] text-muted-foreground">{t("batch_ref_hint")}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("fee_total")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={feeTotal}
              onChange={(e) => setFeeTotal(e.target.value)}
              className="font-mono"
            />
            <div className="text-[11px] text-muted-foreground">{t("fee_total_hint")}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("notes_optional")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <Receipt className="h-4 w-4" />
              {t("confirm_settle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
