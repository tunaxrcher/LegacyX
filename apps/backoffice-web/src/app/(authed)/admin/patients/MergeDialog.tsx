"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { GitMerge, Loader2, ArrowRight } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { clientApi } from "@/lib/clientApi";

type Patient = {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
  appointmentCount: number;
  visitCount: number;
  invoiceCount: number;
  walletCount: number;
};

type Group = { patients: Patient[] };

export function MergeDialog({ group }: { group: Group }) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  // Default the survivor to the patient with the MOST records (less data
  // loss). The user can still pick another. Reason field is required by API.
  const survivorId = React.useMemo(() => {
    return [...group.patients].sort((a, b) => {
      const sumA = a.appointmentCount + a.visitCount + a.invoiceCount + a.walletCount;
      const sumB = b.appointmentCount + b.visitCount + b.invoiceCount + b.walletCount;
      return sumB - sumA;
    })[0]?.id;
  }, [group.patients]);
  const [intoId, setIntoId] = React.useState(survivorId ?? "");
  const [fromId, setFromId] = React.useState<string | undefined>(
    group.patients.find((p) => p.id !== survivorId)?.id,
  );
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setIntoId(survivorId ?? "");
      setFromId(group.patients.find((p) => p.id !== survivorId)?.id);
      setReason("");
    }
  }, [open, survivorId, group.patients]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromId || !intoId || fromId === intoId) {
      toast.error(t("patient_merge.pick_distinct"));
      return;
    }
    if (reason.trim().length < 8) {
      toast.error(t("patient_merge.reason_required"));
      return;
    }
    setBusy(true);
    try {
      await clientApi.post("/api/v1/admin/patients/merge", {
        from_patient_id: fromId,
        into_patient_id: intoId,
        reason: reason.trim(),
      });
      toast.success(t("patient_merge.merge_success"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("patient_merge.merge_failed"), {
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
          <GitMerge className="h-4 w-4" /> {t("patient_merge.merge")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("patient_merge.merge_dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("patient_merge.merge_dialog_desc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PatientPicker
              labelKey="patient_merge.from"
              patients={group.patients}
              value={fromId}
              onChange={setFromId}
              accent="destructive"
              hint={t("patient_merge.from_hint")}
            />
            <PatientPicker
              labelKey="patient_merge.into"
              patients={group.patients}
              value={intoId}
              onChange={setIntoId}
              accent="success"
              hint={t("patient_merge.into_hint")}
            />
          </div>
          {fromId && intoId && fromId !== intoId && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{group.patients.find((p) => p.id === fromId)?.hn}</span>
                <ArrowRight className="h-4 w-4 text-warning" />
                <span>{group.patients.find((p) => p.id === intoId)?.hn}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("patient_merge.merge_warning")}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="reason">{t("patient_merge.reason")}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("patient_merge.reason_placeholder")}
              rows={3}
              minLength={8}
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              {reason.length}/500 — {t("patient_merge.reason_help")}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} variant="destructive">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              {t("patient_merge.confirm_merge")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PatientPicker({
  labelKey,
  patients,
  value,
  onChange,
  accent,
  hint,
}: {
  labelKey: string;
  patients: Patient[];
  value: string | undefined;
  onChange: (v: string) => void;
  accent: "success" | "destructive";
  hint?: string;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-2">
      <Label>
        {t(labelKey as never)} {hint && <span className="text-xs text-muted-foreground">— {hint}</span>}
      </Label>
      <div className="space-y-2">
        {patients.map((p) => {
          const selected = p.id === value;
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => onChange(p.id)}
              className={`w-full rounded-md border p-2 text-left text-sm transition-colors ${
                selected
                  ? accent === "success"
                    ? "border-success bg-success/5"
                    : "border-destructive bg-destructive/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{p.hn}</span>
                <Badge variant="outline" className="text-[10px]">
                  {p.appointmentCount + p.visitCount + p.invoiceCount + p.walletCount} records
                </Badge>
              </div>
              <div className="text-foreground">
                {p.firstName} {p.lastName}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
