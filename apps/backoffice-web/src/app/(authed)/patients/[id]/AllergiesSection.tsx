"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { clientApi } from "@/lib/clientApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AllergyCategory = "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER";
type AllergySeverity = "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING";

export interface AllergyRecord {
  id: string;
  substance: string;
  category: AllergyCategory;
  severity: AllergySeverity;
  reaction?: string;
  note?: string;
  recordedAt: string;
  recordedBy: string;
}

const SEVERITY_VARIANT: Record<AllergySeverity, "warning" | "destructive" | "muted" | "default"> = {
  MILD: "muted",
  MODERATE: "warning",
  SEVERE: "destructive",
  LIFE_THREATENING: "destructive",
};

export function AllergiesSection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: AllergyRecord[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [list, setList] = React.useState<AllergyRecord[]>(initial);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function onAdded(rec: AllergyRecord) {
    setList((prev) => [...prev, rec]);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(t("allergies.remove_confirm"))) return;
    setBusyId(id);
    try {
      await clientApi.delete(`/api/v1/patients/${patientId}/allergies/${id}`);
      setList((prev) => prev.filter((a) => a.id !== id));
      toast.success(t("allergies.remove_success"));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {t("patients.allergies")}
          {list.length > 0 ? (
            <Badge variant="muted" className="ml-1 text-[10px]">
              {list.length}
            </Badge>
          ) : null}
        </CardTitle>
        <AddAllergyDialog patientId={patientId} onAdded={onAdded} />
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("patients.no_allergies")}</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-md border p-2",
                  (a.severity === "SEVERE" || a.severity === "LIFE_THREATENING") &&
                    "border-destructive/40 bg-destructive/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{a.substance}</span>
                    <Badge variant={SEVERITY_VARIANT[a.severity]} className="text-[10px]">
                      {t(`allergies.severity.${a.severity}` as const)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t(`allergies.category.${a.category}` as const)}
                    </Badge>
                  </div>
                  {a.reaction || a.note ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[a.reaction, a.note].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  disabled={busyId === a.id}
                  onClick={() => remove(a.id)}
                  title={t("allergies.remove")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddAllergyDialog({
  patientId,
  onAdded,
}: {
  patientId: string;
  onAdded: (r: AllergyRecord) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [substance, setSubstance] = React.useState("");
  const [category, setCategory] = React.useState<AllergyCategory>("DRUG");
  const [severity, setSeverity] = React.useState<AllergySeverity>("MODERATE");
  const [reaction, setReaction] = React.useState("");
  const [note, setNote] = React.useState("");

  function reset() {
    setSubstance("");
    setCategory("DRUG");
    setSeverity("MODERATE");
    setReaction("");
    setNote("");
  }

  async function submit() {
    if (!substance.trim()) {
      toast.error(t("allergies.substance_required"));
      return;
    }
    setBusy(true);
    try {
      const res = await clientApi.post<{ data: AllergyRecord }>(
        `/api/v1/patients/${patientId}/allergies`,
        {
          substance: substance.trim(),
          category,
          severity,
          reaction: reaction.trim() || undefined,
          note: note.trim() || undefined,
        },
      );
      onAdded(res.data);
      toast.success(t("allergies.add_success"));
      reset();
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("allergies.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("allergies.add_title")}</DialogTitle>
          <DialogDescription>{t("allergies.add_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">{t("allergies.substance")}</label>
            <Input
              autoFocus
              value={substance}
              onChange={(e) => setSubstance(e.target.value)}
              placeholder="Penicillin, Lidocaine, …"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t("allergies.category_label")}</label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as AllergyCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRUG">{t("allergies.category.DRUG")}</SelectItem>
                  <SelectItem value="FOOD">{t("allergies.category.FOOD")}</SelectItem>
                  <SelectItem value="ENVIRONMENTAL">
                    {t("allergies.category.ENVIRONMENTAL")}
                  </SelectItem>
                  <SelectItem value="OTHER">{t("allergies.category.OTHER")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t("allergies.severity_label")}</label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as AllergySeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MILD">{t("allergies.severity.MILD")}</SelectItem>
                  <SelectItem value="MODERATE">{t("allergies.severity.MODERATE")}</SelectItem>
                  <SelectItem value="SEVERE">{t("allergies.severity.SEVERE")}</SelectItem>
                  <SelectItem value="LIFE_THREATENING">
                    {t("allergies.severity.LIFE_THREATENING")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">{t("allergies.reaction")}</label>
            <Input
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              placeholder={t("allergies.reaction_placeholder")}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">{t("allergies.note")}</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" disabled={busy} onClick={submit}>
            {busy ? t("common.saving") : t("allergies.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
