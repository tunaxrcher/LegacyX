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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PatientCombobox, type PatientOption } from "@/components/patient-combobox";
import { clientApi } from "@/lib/clientApi";

function defaultDateTime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset() + 60);
  return d.toISOString().slice(0, 16);
}

export function NewAppointmentDialog() {
  const router = useRouter();
  const t = useTranslations("appointments");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [scheduledAt, setScheduledAt] = React.useState(defaultDateTime());
  const [duration, setDuration] = React.useState(30);
  const [channel, setChannel] = React.useState<"WALKIN" | "ONLINE" | "LIFF" | "PHONE">("WALKIN");
  const [reason, setReason] = React.useState("");

  function reset() {
    setPatient(null);
    setScheduledAt(defaultDateTime());
    setDuration(30);
    setChannel("WALKIN");
    setReason("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient) {
      toast.error(t("select_patient_first"));
      return;
    }
    setSubmitting(true);
    try {
      await clientApi.post("/api/v1/appointments", {
        patient_id: patient.id,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_min: duration,
        channel,
        reason: reason || undefined,
      });
      toast.success(t("create_success"));
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(t("create_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("patient")}</Label>
            <PatientCombobox value={patient} onChange={setPatient} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">{t("scheduled_at")}</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{t("duration_minutes")}</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WALKIN">Walk-in</SelectItem>
                <SelectItem value="PHONE">Phone</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="LIFF">LINE LIFF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">{t("notes")}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("notes_placeholder")}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
