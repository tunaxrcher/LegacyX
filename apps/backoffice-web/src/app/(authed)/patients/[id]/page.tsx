import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  CalendarDays,
  Activity,
  Package,
  Heart,
  AlertTriangle,
  ScrollText,
  Phone,
  Mail,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime, initials } from "@/lib/utils";
import { WalletSection } from "./WalletSection";
import { ConsentsSection } from "./ConsentsSection";
import { AllergiesSection, type AllergyRecord } from "./AllergiesSection";
import { EditPatientDialog } from "./EditPatientDialog";

export const dynamic = "force-dynamic";

type PatientDetail = {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  gender: string | null;
  dob: string | null;
  bloodType: string | null;
  status: string;
  allergies: unknown;
  chronicConditions: unknown;
  appointments: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    channel: string;
    durationMin: number;
    reason: string | null;
  }>;
  visits: Array<{
    id: string;
    status: string;
    checkedInAt: string | null;
    startedAt: string | null;
    appointment: { id: string; scheduledAt: string } | null;
  }>;
  wallets: Array<{
    id: string;
    productId: string;
    balance: number;
    expiresAt: string | null;
    product: { id: string; name: string; sku: string } | null;
  }>;
};

function listifyJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === "object") return Object.values(v as object).map(String);
  return [];
}

function parseAllergies(v: unknown): AllergyRecord[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (a): a is AllergyRecord =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as AllergyRecord).id === "string" &&
      typeof (a as AllergyRecord).substance === "string" &&
      typeof (a as AllergyRecord).severity === "string",
  );
}

export default async function PatientProfile({ params }: { params: { id: string } }) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const roles = session.roles ?? [];
  const isPrivileged = roles.includes("ADMIN");
  const canWritePatient =
    isPrivileged ||
    roles.includes("DOCTOR") ||
    roles.includes("MANAGER") ||
    roles.includes("RECEPTION");

  const [detail, consentsRes] = await Promise.all([
    apiJson<{ data: PatientDetail }>(session, `/api/v1/patients/${params.id}`).catch(
      () => null,
    ),
    apiJson<{
      data: Array<{
        id: string;
        documentType: string;
        documentVersion: string;
        contentHash: string;
        signedAt: string;
        signedByName: string;
      }>;
    }>(session, `/api/v1/patients/${params.id}/consents`).catch(() => ({ data: [] })),
  ]);
  if (!detail?.data) notFound();
  const p = detail.data;
  const consents = consentsRes?.data ?? [];

  const fullName = `${p.firstName} ${p.lastName}`;
  // Phase R — allergies are now a structured array (typed AllergyRecord[]).
  // We re-parse defensively because a few legacy patient rows still hold the
  // free-text format and we don't want one bad row to crash the page.
  const allergies = parseAllergies(p.allergies);
  const chronic = listifyJson(p.chronicConditions);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName}
        description={
          <span className="inline-flex items-center gap-2 font-mono text-xs">
            HN {p.hn} · {p.id}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={p.status === "ACTIVE" ? "success" : "muted"}>{p.status}</Badge>
            {canWritePatient && <EditPatientDialog patient={p} />}
          </div>
        }
      />

      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials(fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 gap-3 sm:grid-cols-4">
            <Stat label={t("patients.gender")} value={p.gender ?? "—"} />
            <Stat
              label={t("patients.dob")}
              value={p.dob ? formatDate(p.dob) : "—"}
            />
            <Stat label={t("patients.blood_type")} value={p.bloodType ?? "—"} />
            <Stat label={t("appointments.title")} value={String(p.appointments.length)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-3">
          <ContactRow
            icon={<Phone className="h-3.5 w-3.5" />}
            label={t("patients.phone")}
            value={p.phone}
          />
          <ContactRow
            icon={<Mail className="h-3.5 w-3.5" />}
            label={t("patients.email")}
            value={p.email}
          />
          <ContactRow
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label={t("patients.national_id")}
            value={p.nationalId}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("patients.tab_overview")}</TabsTrigger>
          <TabsTrigger value="appointments" className="gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {t("patients.tab_appointments")}
            <Badge variant="secondary" className="ml-1">
              {p.appointments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="visits" className="gap-1">
            <Activity className="h-3.5 w-3.5" /> {t("patients.tab_visits")}
            <Badge variant="secondary" className="ml-1">
              {p.visits.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="wallet" className="gap-1">
            <Package className="h-3.5 w-3.5" /> {t("patients.tab_wallet")}
            <Badge variant="secondary" className="ml-1">
              {p.wallets.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="consents" className="gap-1">
            <ScrollText className="h-3.5 w-3.5" /> {t("patients.tab_consents")}
            <Badge variant="secondary" className="ml-1">
              {consents.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
          <AllergiesSection patientId={p.id} initial={allergies} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="h-4 w-4 text-destructive" />
                {t("patients.chronic")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chronic.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("patients.no_allergies")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {chronic.map((c, i) => (
                    <Badge key={i} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {p.appointments.length === 0 ? (
                <EmptyState
                  className="m-6"
                  icon={<CalendarDays className="h-5 w-5" />}
                  title={t("appointments.empty_title")}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("appointments.scheduled_at")}</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>{t("appointments.duration")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("appointments.notes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.appointments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">
                          {formatDateTime(a.scheduledAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.channel}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{a.durationMin}m</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {t.has(`appointments.status.${a.status}`)
                              ? t(`appointments.status.${a.status}` as never)
                              : a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
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

        <TabsContent value="visits" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {p.visits.length === 0 ? (
                <EmptyState
                  className="m-6"
                  icon={<Activity className="h-5 w-5" />}
                  title={t("visits.empty_title")}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("visits.checked_in_at")}</TableHead>
                      <TableHead>{t("visits.started_at")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.visits.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-sm">
                          {v.checkedInAt ? formatDateTime(v.checkedInAt) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {v.startedAt ? formatDateTime(v.startedAt) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="info">
                            {t.has(`visits.status.${v.status}`)
                              ? t(`visits.status.${v.status}` as never)
                              : v.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/visits/${v.id}`}
                            className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            {t("common.details")}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet" className="mt-4">
          <WalletSection patientId={p.id} wallets={p.wallets} />
        </TabsContent>

        <TabsContent value="consents" className="mt-4">
          <ConsentsSection
            patientId={p.id}
            patientName={fullName}
            consents={consents}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 text-muted-foreground">{icon}</span>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-medium">{value ?? "—"}</div>
      </div>
    </div>
  );
}
