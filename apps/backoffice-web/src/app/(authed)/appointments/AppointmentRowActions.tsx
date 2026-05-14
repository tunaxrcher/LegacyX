"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, X, Loader2 } from "lucide-react";
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
import { clientApi } from "@/lib/clientApi";

interface DoctorOption {
  id: string;
  fullName: string;
}
interface ServiceOption {
  id: string;
  name: string;
  nameTh: string;
  durationMin: number;
  category: { name: string; nameTh: string };
}

interface Props {
  appointmentId: string;
  status: string;
  scheduledAt: string;
  durationMin: number;
  doctorId: string | null;
  reason: string | null;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function AppointmentRowActions(props: Props) {
  const cannotEdit =
    props.status === "COMPLETED" ||
    props.status === "CANCELLED" ||
    props.status === "NO_SHOW";

  return (
    <div className="flex items-center gap-1.5">
      {!cannotEdit && <EditAppointmentButton {...props} />}
      {props.status !== "COMPLETED" && props.status !== "CANCELLED" && (
        <CancelAppointmentButton appointmentId={props.appointmentId} />
      )}
    </div>
  );
}

function EditAppointmentButton(props: Props) {
  const router = useRouter();
  const t = useTranslations("appointments");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [doctorId, setDoctorId] = React.useState(props.doctorId ?? "__none");
  const [serviceId, setServiceId] = React.useState("__none");
  const [scheduledAt, setScheduledAt] = React.useState(
    toLocalInput(props.scheduledAt),
  );
  const [duration, setDuration] = React.useState(props.durationMin);
  const [reason, setReason] = React.useState(props.reason ?? "");
  const [doctors, setDoctors] = React.useState<DoctorOption[]>([]);
  const [services, setServices] = React.useState<ServiceOption[]>([]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/appointments/${props.appointmentId}`, {
        doctor_id: doctorId !== "__none" ? doctorId : null,
        service_id: serviceId !== "__none" ? serviceId : undefined,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_min: duration,
        reason: reason || null,
      });
      toast.success(t("edit_success"));
      setOpen(false);
      router.refresh();
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
        <Button variant="ghost" size="sm" title={t("edit")}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
          <DialogDescription>{t("edit_subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("service")}</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("select_service")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— {t("no_service")}</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nameTh || s.name} · {s.durationMin} {t("minutes")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("doctor")}</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger>
                <SelectValue placeholder={t("select_doctor")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— {t("no_doctor")}</SelectItem>
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
              <Label htmlFor="scheduled_at">{t("scheduled_at")}</Label>
              <Input
                id="scheduled_at"
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
            <Label htmlFor="reason">{t("notes")}</Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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

function CancelAppointmentButton({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const router = useRouter();
  const t = useTranslations("appointments");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      toast.error(t("cancel_reason"));
      return;
    }
    setBusy(true);
    try {
      const qs = new URLSearchParams({ reason }).toString();
      await clientApi.delete(
        `/api/v1/appointments/${appointmentId}?${qs}`,
      );
      toast.success(t("cancel_success"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("cancel_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={t("cancel_appointment")}
          className="text-destructive hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancel_appointment")}</DialogTitle>
          <DialogDescription>{t("cancel_subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel_reason">{t("cancel_reason")}*</Label>
            <Textarea
              id="cancel_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("cancel_reason_placeholder")}
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("cancel_confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
