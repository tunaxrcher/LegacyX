"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Loader2, UserRound, Stethoscope } from "lucide-react";
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

interface DoctorOption {
  id: string;
  fullName: string;
}
interface ServiceOption {
  id: string;
  name: string;
  nameTh: string;
  durationMin: number;
  priceFrom: number | null;
  priceTo: number | null;
  category: { name: string; nameTh: string };
}

export function NewAppointmentDialog() {
  const router = useRouter();
  const t = useTranslations("appointments");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [doctorId, setDoctorId] = React.useState<string>("__none");
  const [serviceId, setServiceId] = React.useState<string>("__none");
  const [scheduledAt, setScheduledAt] = React.useState(defaultDateTime());
  const [duration, setDuration] = React.useState(30);
  const [channel, setChannel] = React.useState<"WALKIN" | "ONLINE" | "LIFF" | "PHONE">("WALKIN");
  const [reason, setReason] = React.useState("");

  const [doctors, setDoctors] = React.useState<DoctorOption[]>([]);
  const [services, setServices] = React.useState<ServiceOption[]>([]);

  // Lazy-load doctors + services when the dialog first opens (cheap, scoped
  // to this tenant; backoffice users browse small lists).
  React.useEffect(() => {
    if (!open) return;
    Promise.all([
      clientApi
        .get<{ data: DoctorOption[] }>("/api/v1/staff?role=DOCTOR&limit=100")
        .then((r) => setDoctors(r.data ?? []))
        .catch(() => setDoctors([])),
      clientApi
        .get<{ data: ServiceOption[] }>("/api/v1/services?active=true")
        .then((r) => setServices(r.data ?? []))
        .catch(() => setServices([])),
    ]);
  }, [open]);

  // Auto-update duration when a service is picked (and user hasn't manually
  // overridden it). The duration field is left editable so reception can
  // tweak for special cases.
  const lastAutoDuration = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (serviceId === "__none") return;
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    // Only auto-fill when the user hasn't typed a custom value
    if (lastAutoDuration.current === duration || duration === 30) {
      setDuration(svc.durationMin);
      lastAutoDuration.current = svc.durationMin;
    }
  }, [serviceId, services]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setPatient(null);
    setDoctorId("__none");
    setServiceId("__none");
    setScheduledAt(defaultDateTime());
    setDuration(30);
    setChannel("WALKIN");
    setReason("");
    lastAutoDuration.current = null;
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
        doctor_id: doctorId !== "__none" ? doctorId : undefined,
        service_id: serviceId !== "__none" ? serviceId : undefined,
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {t("patient")}*
            </Label>
            <PatientCombobox value={patient} onChange={setPatient} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service" className="flex items-center gap-1.5">
              {t("service")}{" "}
              <span className="text-xs text-muted-foreground">{t("optional")}</span>
            </Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger id="service">
                <SelectValue placeholder={t("select_service")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">
                  <span className="text-muted-foreground">— {t("no_service")}</span>
                </SelectItem>
                {services.map((s) => {
                  const price =
                    s.priceFrom != null && s.priceTo != null && s.priceFrom !== s.priceTo
                      ? `฿${s.priceFrom.toLocaleString()}–${s.priceTo.toLocaleString()}`
                      : s.priceFrom != null
                        ? `฿${s.priceFrom.toLocaleString()}`
                        : s.priceTo != null
                          ? `฿${s.priceTo.toLocaleString()}`
                          : null;
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex flex-col">
                        <span>{s.nameTh || s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.category.nameTh || s.category.name} · {s.durationMin}{" "}
                          {t("minutes")}
                          {price ? ` · ${price}` : ""}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doctor" className="flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" />
              {t("doctor")}{" "}
              <span className="text-xs text-muted-foreground">{t("optional")}</span>
            </Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger id="doctor">
                <SelectValue placeholder={t("select_doctor")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">
                  <span className="text-muted-foreground">— {t("no_doctor")}</span>
                </SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  lastAutoDuration.current = null;
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                {t("duration_hint")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("channel")}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WALKIN">{t("channel_walkin")}</SelectItem>
                <SelectItem value="PHONE">{t("channel_phone")}</SelectItem>
                <SelectItem value="ONLINE">{t("channel_online")}</SelectItem>
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
