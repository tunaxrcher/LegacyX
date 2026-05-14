"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  PlayCircle,
  Lock,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Loader2,
  Pencil,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export interface ShiftDto {
  id: string;
  branchId: string;
  openedBy: string;
  closedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  cashOpening: string;
  cashCounted: string | null;
  cashExpected: string | null;
  variance: string | null;
  notes: string | null;
  cashExpectedLive?: string;
  paymentsCountLive?: number;
}

const fmtTHB = (n: number | string) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(typeof n === "string" ? Number(n) : n);

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });

export function ShiftPanel({ initialShift }: { initialShift: ShiftDto | null }) {
  const t = useTranslations("eod");
  const router = useRouter();
  const [shift, setShift] = React.useState(initialShift);

  return (
    <div className="space-y-4">
      {shift ? (
        <OpenShiftCard
          shift={shift}
          onClosed={() => {
            setShift(null);
            router.refresh();
          }}
        />
      ) : (
        <ClosedShiftCard
          onOpened={(s) => {
            setShift(s);
            router.refresh();
          }}
        />
      )}

      <RecentShifts />
    </div>
  );
}

function ClosedShiftCard({ onOpened }: { onOpened: (s: ShiftDto) => void }) {
  const t = useTranslations("eod");

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Banknote className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold">{t("no_open_shift")}</div>
          <div className="text-sm text-muted-foreground">{t("no_open_shift_desc")}</div>
        </div>
        <OpenShiftDialog onOpened={onOpened} />
      </CardContent>
    </Card>
  );
}

function OpenShiftDialog({ onOpened }: { onOpened: (s: ShiftDto) => void }) {
  const t = useTranslations("eod");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [cashOpening, setCashOpening] = React.useState("0");
  const [notes, setNotes] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await clientApi.post<{ data: ShiftDto }>("/api/v1/shifts", {
        cash_opening: cashOpening,
        notes: notes || undefined,
      });
      toast.success(t("open_success"));
      setOpen(false);
      onOpened(result.data);
    } catch (err) {
      toast.error(t("open_failed"), {
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
          <PlayCircle className="h-4 w-4" />
          {t("open_shift")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("open_shift")}</DialogTitle>
          <DialogDescription>{t("open_shift_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("cash_opening")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              required
              value={cashOpening}
              onChange={(e) => setCashOpening(e.target.value)}
              className="font-mono"
            />
            <div className="text-[11px] text-muted-foreground">
              {t("cash_opening_hint")}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{tCommon("notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("open_shift")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenShiftCard({
  shift,
  onClosed,
}: {
  shift: ShiftDto;
  onClosed: () => void;
}) {
  const t = useTranslations("eod");
  const router = useRouter();
  const expected = shift.cashExpectedLive ?? "0";
  const cashOpening = shift.cashOpening;
  const totalExpected = (Number(cashOpening) + Number(expected)).toString();
  const elapsed = useElapsed(shift.openedAt);

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-info" />
              <h3 className="text-base font-semibold">{t("shift_open_title")}</h3>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("opened_at")} {fmtTime(shift.openedAt)} · {t("opened_by")}{" "}
              <code className="rounded bg-muted px-1 font-mono text-[10px]">
                {shift.openedBy.slice(-8)}
              </code>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-info">
              <Clock className="h-3 w-3" />
              {t("running_for")} {elapsed}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EditShiftDialog
              shift={shift}
              onUpdated={() => router.refresh()}
            />
            <CloseShiftDialog
              shift={shift}
              totalExpected={totalExpected}
              onClosed={onClosed}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
          <Stat label={t("cash_opening")} value={fmtTHB(cashOpening)} />
          <Stat
            label={t("cash_in_today")}
            value={fmtTHB(expected)}
            sub={`${shift.paymentsCountLive ?? 0} txn`}
          />
          <Stat
            label={t("expected_total")}
            value={fmtTHB(totalExpected)}
            highlight
          />
        </div>

        {shift.notes && (
          <div className="text-xs italic text-muted-foreground">
            “{shift.notes}”
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`tabular-nums ${
          highlight ? "text-lg font-semibold text-primary" : "text-base font-medium"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CloseShiftDialog({
  shift,
  totalExpected,
  onClosed,
}: {
  shift: ShiftDto;
  totalExpected: string;
  onClosed: () => void;
}) {
  const t = useTranslations("eod");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [counted, setCounted] = React.useState(totalExpected);
  const [notes, setNotes] = React.useState("");
  const [result, setResult] = React.useState<ShiftDto | null>(null);
  const variance = (Number(counted) - Number(totalExpected)).toFixed(2);
  const variancePos = Number(variance) >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await clientApi.post<{ data: ShiftDto }>(
        `/api/v1/shifts/${shift.id}/close`,
        { cash_counted: counted, notes: notes || undefined },
      );
      setResult(r.data);
      toast.success(t("close_success"));
    } catch (err) {
      toast.error(t("close_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val && result) {
      onClosed();
      setResult(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Lock className="h-4 w-4" />
          {t("close_shift")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("close_shift")}</DialogTitle>
          <DialogDescription>{t("close_shift_desc")}</DialogDescription>
        </DialogHeader>
        {result ? (
          <CloseSummary result={result} />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("expected_total")}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {fmtTHB(totalExpected)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("opening")} {fmtTHB(shift.cashOpening)} +{" "}
                {t("collected")} {fmtTHB(shift.cashExpectedLive ?? "0")}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t("cash_counted")}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                className="font-mono text-lg"
              />
            </div>

            <div
              className={`flex items-center justify-between rounded-md border p-3 ${
                Number(variance) === 0
                  ? "border-success/40 bg-success/5"
                  : variancePos
                    ? "border-info/40 bg-info/5"
                    : "border-warning/40 bg-warning/5"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                {Number(variance) === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : variancePos ? (
                  <TrendingUp className="h-4 w-4 text-info" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-warning" />
                )}
                <span className="font-medium">{t("variance")}</span>
              </div>
              <div className="font-mono text-base tabular-nums">
                {variancePos && Number(variance) > 0 ? "+" : ""}
                {fmtTHB(variance)}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t("notes_optional")}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notes_placeholder")}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("confirm_close")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CloseSummary({ result }: { result: ShiftDto }) {
  const t = useTranslations("eod");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2 rounded-md border border-success/40 bg-success/10 p-4 text-success">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">{t("closed_label")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
        <Row label={t("cash_opening")} value={fmtTHB(result.cashOpening)} />
        <Row label={t("cash_expected")} value={fmtTHB(result.cashExpected ?? "0")} />
        <Row label={t("cash_counted")} value={fmtTHB(result.cashCounted ?? "0")} />
        <Row
          label={t("variance")}
          value={fmtTHB(result.variance ?? "0")}
          tone={
            Number(result.variance) === 0
              ? "ok"
              : Number(result.variance) > 0
                ? "info"
                : "warn"
          }
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "info";
}) {
  const colour =
    tone === "ok"
      ? "text-success"
      : tone === "warn"
        ? "text-warning"
        : tone === "info"
          ? "text-info"
          : "text-foreground";
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono tabular-nums ${colour}`}>{value}</div>
    </div>
  );
}

function useElapsed(iso: string): string {
  const [tick, setTick] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const ms = tick - new Date(iso).getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function EditShiftDialog({
  shift,
  onUpdated,
}: {
  shift: ShiftDto;
  onUpdated: () => void;
}) {
  const t = useTranslations("eod");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [cashOpening, setCashOpening] = React.useState(shift.cashOpening);
  const [notes, setNotes] = React.useState(shift.notes ?? "");

  React.useEffect(() => {
    if (open) {
      setCashOpening(shift.cashOpening);
      setNotes(shift.notes ?? "");
    }
  }, [open, shift]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/shifts/${shift.id}`, {
        cash_opening: cashOpening,
        notes: notes || undefined,
      });
      toast.success(t("edit_success"));
      setOpen(false);
      onUpdated();
    } catch (err) {
      toast.error(t("edit_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-3.5 w-3.5" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit_shift")}</DialogTitle>
          <DialogDescription>{t("edit_shift_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("cash_opening")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              required
              value={cashOpening}
              onChange={(e) => setCashOpening(e.target.value)}
              className="font-mono"
            />
            <div className="text-[11px] text-muted-foreground">
              {t("cash_opening_hint")}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{tCommon("notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecentShifts() {
  const t = useTranslations("eod");
  const [rows, setRows] = React.useState<ShiftDto[] | null>(null);

  React.useEffect(() => {
    let active = true;
    clientApi
      .get<{ data: ShiftDto[] }>("/api/v1/shifts?limit=10")
      .then((r) => {
        if (active) setRows(r.data);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (rows === null) {
    return (
      <div className="text-xs italic text-muted-foreground">
        {t("loading_history")}
      </div>
    );
  }
  if (rows.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h4 className="text-sm font-semibold">{t("recent_shifts")}</h4>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("opened_at")}</th>
                <th className="px-3 py-2 text-left">{t("closed_at")}</th>
                <th className="px-3 py-2 text-right">{t("cash_opening")}</th>
                <th className="px-3 py-2 text-right">{t("cash_counted")}</th>
                <th className="px-3 py-2 text-right">{t("variance")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{fmtTime(r.openedAt)}</td>
                  <td className="px-3 py-2">
                    {r.closedAt ? fmtTime(r.closedAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtTHB(r.cashOpening)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.cashCounted ? fmtTHB(r.cashCounted) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.variance ? fmtTHB(r.variance) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
