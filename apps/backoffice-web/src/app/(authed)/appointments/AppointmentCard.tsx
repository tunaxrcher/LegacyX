import Link from "next/link";
import { Clock, Stethoscope, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CheckInDialog } from "./CheckInDialog";
import { AppointmentRowActions } from "./AppointmentRowActions";

export type AppointmentPatient = {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
} | null;

export type Appointment = {
  id: string;
  patientId: string;
  patient: AppointmentPatient;
  doctorId: string | null;
  doctor: { id: string; fullName: string | null } | null;
  scheduledAt: string;
  durationMin: number;
  channel: string;
  status: string;
  reason: string | null;
};

export const STATUS_VARIANT: Record<
  string,
  "info" | "success" | "warning" | "destructive" | "secondary" | "muted"
> = {
  BOOKED: "info",
  CONFIRMED: "info",
  CHECKED_IN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
  NO_SHOW: "muted",
};

export const STATUS_BORDER: Record<string, string> = {
  BOOKED: "border-l-info",
  CONFIRMED: "border-l-info",
  CHECKED_IN: "border-l-info",
  IN_PROGRESS: "border-l-warning",
  COMPLETED: "border-l-success",
  CANCELLED: "border-l-destructive",
  NO_SHOW: "border-l-muted-foreground",
};

export function patientLabel(p: AppointmentPatient, fallback: string) {
  if (!p) return fallback;
  return `${p.firstName} ${p.lastName} · HN ${p.hn}`;
}

export function fmtTimeOnly(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Big card used in the Day view. Compact card variants for week/month views
 * are inline in their respective files (different layout constraints).
 */
export function AppointmentCard({
  appt,
  statusLabels,
  showCheckIn = true,
}: {
  appt: Appointment;
  statusLabels: Record<string, string>;
  showCheckIn?: boolean;
}) {
  const statusLabel = statusLabels[appt.status] ?? appt.status;
  const variant = STATUS_VARIANT[appt.status] ?? "secondary";
  const border = STATUS_BORDER[appt.status] ?? "border-l-muted";

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-l-4 bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-soft-lg sm:flex-row sm:items-center sm:justify-between ${border}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Clock className="h-3 w-3 opacity-60" />
          <span className="text-xs font-bold tabular-nums leading-tight">
            {fmtTimeOnly(appt.scheduledAt)}
          </span>
        </div>
        <div className="space-y-1">
          <Link
            href={appt.patient ? `/patients/${appt.patient.id}` : "#"}
            className="flex items-center gap-2 text-sm font-semibold hover:underline"
          >
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            {patientLabel(appt.patient, appt.patientId)}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{appt.durationMin} min</span>
            <span>·</span>
            <Badge variant="outline" className="h-5 px-1.5 font-normal">
              {appt.channel}
            </Badge>
            {appt.doctor?.fullName && (
              <span className="inline-flex items-center gap-1">
                <Stethoscope className="h-3 w-3" />
                {appt.doctor.fullName}
              </span>
            )}
            {appt.reason && (
              <span className="truncate max-w-xs">· {appt.reason}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {showCheckIn &&
          (appt.status === "BOOKED" || appt.status === "CONFIRMED") && (
            <CheckInDialog
              appointmentId={appt.id}
              patientLabel={patientLabel(appt.patient, appt.patientId)}
            />
          )}
        <AppointmentRowActions
          appointmentId={appt.id}
          status={appt.status}
          scheduledAt={appt.scheduledAt}
          durationMin={appt.durationMin}
          doctorId={appt.doctorId}
          reason={appt.reason}
        />
        <Badge variant={variant}>{statusLabel}</Badge>
      </div>
    </div>
  );
}
