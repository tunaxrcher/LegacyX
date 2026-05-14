import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_VARIANT,
  fmtTimeOnly,
  patientLabel,
  type Appointment,
} from "./AppointmentCard";
import {
  addDays,
  fmtDateInput,
  isSameDay,
  isToday,
  startOfWeek,
} from "./time-utils";

interface Props {
  appointments: Appointment[];
  anchor: Date;
  statusLabels: Record<string, string>;
  searchParamsString: string;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekView({
  appointments,
  anchor,
  statusLabels,
  searchParamsString,
}: Props) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  // Bucket per day
  const byDay = days.map((d) =>
    appointments
      .filter((a) => isSameDay(new Date(a.scheduledAt), d))
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((d, i) => {
        const dayAppts = byDay[i] ?? [];
        const dayParams = new URLSearchParams(searchParamsString);
        dayParams.set("view", "day");
        dayParams.set("date", fmtDateInput(d));
        return (
          <Card
            key={d.toISOString()}
            className={`overflow-hidden transition-colors ${
              isToday(d) ? "border-primary/60 bg-primary/5" : ""
            }`}
          >
            <CardContent className="space-y-2 p-3">
              <Link
                href={`/appointments?${dayParams.toString()}`}
                className="block space-y-0.5 hover:underline"
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {DAY_NAMES[i]}
                </div>
                <div
                  className={`text-lg font-bold tabular-nums ${
                    isToday(d) ? "text-primary" : ""
                  }`}
                >
                  {d.getDate()}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {dayAppts.length} {dayAppts.length === 1 ? "appt" : "appts"}
                </div>
              </Link>
              <div className="space-y-1.5">
                {dayAppts.length === 0 ? (
                  <div className="rounded-md border border-dashed py-3 text-center text-[10px] italic text-muted-foreground">
                    —
                  </div>
                ) : (
                  dayAppts.slice(0, 6).map((a) => {
                    const variant = STATUS_VARIANT[a.status] ?? "secondary";
                    return (
                      <Link
                        key={a.id}
                        href={
                          a.patient
                            ? `/patients/${a.patient.id}`
                            : "#"
                        }
                        className="block rounded-md border bg-background p-1.5 text-[11px] transition-colors hover:bg-muted"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-semibold">
                            {fmtTimeOnly(a.scheduledAt)}
                          </span>
                          <Badge variant={variant} className="h-4 px-1 text-[9px]">
                            {statusLabels[a.status] ?? a.status}
                          </Badge>
                        </div>
                        <div className="truncate">
                          {patientLabel(a.patient, a.patientId)}
                        </div>
                        {a.doctor?.fullName && (
                          <div className="truncate text-[10px] text-muted-foreground">
                            {a.doctor.fullName}
                          </div>
                        )}
                      </Link>
                    );
                  })
                )}
                {dayAppts.length > 6 && (
                  <Link
                    href={`/appointments?${dayParams.toString()}`}
                    className="block rounded-md border border-dashed py-1 text-center text-[10px] text-primary hover:bg-muted"
                  >
                    +{dayAppts.length - 6} more
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
