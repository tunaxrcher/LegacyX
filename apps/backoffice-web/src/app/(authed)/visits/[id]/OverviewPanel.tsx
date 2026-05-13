import Link from "next/link";
import { User, Clock, Activity, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

interface OverviewPanelProps {
  patient: { id: string; hn: string; firstName: string; lastName: string } | null;
  checkedInAt: string | null;
  startedAt: string | null;
  orderCount: number;
  emrStatus: "NONE" | "DRAFT" | "SIGNED" | "AMENDED";
  emrVersion: number | null;
  labels: {
    name: string;
    checkedIn: string;
    started: string;
    orders: string;
    emr: string;
  };
}

export function OverviewPanel({
  patient,
  checkedInAt,
  startedAt,
  orderCount,
  emrStatus,
  emrVersion,
  labels,
}: OverviewPanelProps) {
  const patientLabel = patient ? `${patient.firstName} ${patient.lastName}` : "—";
  const emrVariant: Record<typeof emrStatus, "info" | "success" | "warning" | "muted"> = {
    NONE: "muted",
    DRAFT: "warning",
    SIGNED: "success",
    AMENDED: "info",
  };

  return (
    <Card>
      <CardContent className="grid gap-4 py-4 sm:grid-cols-4">
        <Stat
          icon={<User className="h-4 w-4" />}
          label={labels.name}
          value={
            patient ? (
              <Link href={`/patients/${patient.id}`} className="hover:underline">
                {patientLabel}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label={labels.checkedIn}
          value={checkedInAt ? formatDateTime(checkedInAt) : "—"}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label={labels.started}
          value={startedAt ? formatDateTime(startedAt) : "—"}
        />
        <Stat
          icon={<FileText className="h-4 w-4" />}
          label={labels.emr}
          value={
            emrStatus === "NONE" ? (
              "—"
            ) : (
              <Badge variant={emrVariant[emrStatus]}>
                {emrStatus}
                {emrVersion ? ` v${emrVersion}` : ""}
              </Badge>
            )
          }
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label={labels.orders}
          value={`${orderCount}`}
        />
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
