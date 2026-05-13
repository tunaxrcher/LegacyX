import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarDays, Clock, User } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { CheckInDialog } from "./CheckInDialog";

type Patient = { id: string; hn: string; firstName: string; lastName: string } | null;
type Appt = {
  id: string;
  patientId: string;
  patient: Patient;
  doctorId: string | null;
  scheduledAt: string;
  durationMin: number;
  channel: string;
  status: string;
  reason: string | null;
};
type ListResp = { data: Appt[]; pagination: { total: number; page: number; perPage: number } };

const STATUS_VARIANT: Record<string, "info" | "success" | "warning" | "destructive" | "secondary" | "muted"> = {
  BOOKED: "info",
  CONFIRMED: "info",
  CHECKED_IN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
  NO_SHOW: "muted",
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function patientLabel(p: Patient, fallback: string) {
  if (!p) return fallback;
  return `${p.firstName} ${p.lastName} · HN ${p.hn}`;
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const v = STATUS_VARIANT[status] ?? "secondary";
  const key = `appointments.status.${status}`;
  const label = (() => {
    try {
      return t(key);
    } catch {
      return status;
    }
  })();
  return <Badge variant={v}>{label}</Badge>;
}

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const fromIso = startOfDay().toISOString();
  const toIso = endOfDay().toISOString();
  const [todayList, allList] = await Promise.all([
    apiJson<ListResp>(
      session,
      `/api/v1/appointments?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&perPage=100`
    ).catch(() => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } } as ListResp)),
    apiJson<ListResp>(session, "/api/v1/appointments?perPage=50").catch(
      () => ({ data: [], pagination: { total: 0, page: 1, perPage: 0 } } as ListResp)
    ),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("appointments.title")}
        description={`${t("appointments.subtitle")} · ${session.branchName ?? ""}`}
        actions={<NewAppointmentDialog />}
      />

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today" className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> {t("appointments.today_view")}
            <Badge variant="secondary" className="ml-1">
              {todayList.data.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            {t("appointments.list_view")}
            <Badge variant="secondary" className="ml-1">
              {allList.pagination.total}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Today timeline */}
        <TabsContent value="today" className="mt-4">
          {todayList.data.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title={t("appointments.empty_title")}
              description={t("appointments.empty_desc")}
              action={<NewAppointmentDialog />}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {new Intl.DateTimeFormat("th-TH", {
                    dateStyle: "full",
                  }).format(new Date())}
                </CardTitle>
                <CardDescription>{t("appointments.today_view")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-3 border-l border-border pl-6">
                  {todayList.data
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.scheduledAt).getTime() -
                        new Date(b.scheduledAt).getTime()
                    )
                    .map((a) => (
                      <li key={a.id} className="relative">
                        <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border bg-background">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                        </span>
                        <Card className="border-l-4 border-l-primary/40 transition-colors hover:bg-accent/30">
                          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-12 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
                                <span className="text-[10px] font-medium uppercase">
                                  {new Intl.DateTimeFormat("en-GB", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }).format(new Date(a.scheduledAt))}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                  {patientLabel(a.patient, a.patientId)}
                                </div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {a.durationMin} {t("common.loading") ? "min" : "min"} · {a.channel}
                                  {a.reason ? ` · ${a.reason}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(a.status === "BOOKED" || a.status === "CONFIRMED") && (
                                <CheckInDialog
                                  appointmentId={a.id}
                                  patientLabel={patientLabel(a.patient, a.patientId)}
                                />
                              )}
                              <StatusBadge status={a.status} t={t} />
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* All list */}
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {allList.data.length === 0 ? (
                <EmptyState
                  className="m-6"
                  icon={<CalendarDays className="h-5 w-5" />}
                  title={t("appointments.empty_title")}
                  description={t("appointments.empty_desc")}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("appointments.scheduled_at")}</TableHead>
                      <TableHead>{t("appointments.patient")}</TableHead>
                      <TableHead>{t("appointments.duration")}</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("appointments.notes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allList.data.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm tabular-nums">
                          {new Intl.DateTimeFormat("th-TH", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(a.scheduledAt))}
                        </TableCell>
                        <TableCell className="text-sm">
                          {patientLabel(a.patient, a.patientId)}
                        </TableCell>
                        <TableCell className="text-sm">{a.durationMin}m</TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.channel}</Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} t={t} />
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                          {a.reason ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
