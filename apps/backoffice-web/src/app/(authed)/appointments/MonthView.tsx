import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  STATUS_VARIANT,
  fmtTimeOnly,
  patientLabel,
  type Appointment,
} from "./AppointmentCard";
import {
  fmtDateInput,
  isSameDay,
  isToday,
  monthGrid,
  startOfMonth,
} from "./time-utils";

interface Props {
  appointments: Appointment[];
  anchor: Date;
  statusLabels: Record<string, string>;
  searchParamsString: string;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({
  appointments,
  anchor,
  statusLabels,
  searchParamsString,
}: Props) {
  const days = monthGrid(anchor);
  const monthStart = startOfMonth(anchor);

  // Bucket per day
  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = fmtDateInput(new Date(a.scheduledAt));
    const arr = byDay.get(key) ?? [];
    arr.push(a);
    byDay.set(key, arr);
  }
  for (const arr of byDay.values()) {
    arr.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }

  return (
    <Card>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {DAY_HEADERS.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const dayKey = fmtDateInput(d);
            const dayAppts = byDay.get(dayKey) ?? [];
            const inMonth = d.getMonth() === monthStart.getMonth();
            const dayParams = new URLSearchParams(searchParamsString);
            dayParams.set("view", "day");
            dayParams.set("date", dayKey);

            return (
              <Link
                key={dayKey}
                href={`/appointments?${dayParams.toString()}`}
                className={`min-h-[100px] rounded-md border p-1.5 transition-colors hover:border-primary/50 ${
                  inMonth ? "bg-background" : "bg-muted/30"
                } ${isToday(d) ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      !inMonth ? "text-muted-foreground/50" : ""
                    } ${isToday(d) ? "text-primary" : ""}`}
                  >
                    {d.getDate()}
                  </span>
                  {dayAppts.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 text-[9px] font-semibold text-primary">
                      {dayAppts.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayAppts.slice(0, 3).map((a) => {
                    const variant = STATUS_VARIANT[a.status] ?? "secondary";
                    const tone =
                      variant === "info"
                        ? "border-info/40 bg-info/5"
                        : variant === "warning"
                          ? "border-warning/40 bg-warning/5"
                          : variant === "success"
                            ? "border-success/40 bg-success/5"
                            : variant === "destructive"
                              ? "border-destructive/40 bg-destructive/5"
                              : "border-muted bg-muted/30";
                    return (
                      <div
                        key={a.id}
                        title={`${fmtTimeOnly(a.scheduledAt)} · ${patientLabel(a.patient, a.patientId)}${
                          a.doctor?.fullName ? ` · ${a.doctor.fullName}` : ""
                        } · ${statusLabels[a.status] ?? a.status}`}
                        className={`truncate rounded border px-1 py-0.5 text-[9px] leading-tight ${tone}`}
                      >
                        <span className="font-mono">{fmtTimeOnly(a.scheduledAt)}</span>{" "}
                        {a.patient
                          ? `${a.patient.firstName.slice(0, 6)}.${a.patient.lastName.slice(0, 1)}.`
                          : "—"}
                      </div>
                    );
                  })}
                  {dayAppts.length > 3 && (
                    <div className="text-[9px] text-muted-foreground">
                      +{dayAppts.length - 3} more
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
