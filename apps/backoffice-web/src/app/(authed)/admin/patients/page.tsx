import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, Phone, GitMerge, History } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { MergeDialog } from "./MergeDialog";

export const dynamic = "force-dynamic";

type DupGroup = {
  signal: "phone" | "name+dob" | "name";
  patients: Array<{
    id: string;
    hn: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: string;
    appointmentCount: number;
    visitCount: number;
    invoiceCount: number;
    walletCount: number;
  }>;
};

type MergeLog = {
  id: string;
  fromPatientId: string;
  intoPatientId: string;
  performedBy: string;
  reason: string;
  createdAt: string;
};

const SIGNAL_LABEL: Record<DupGroup["signal"], { label: string; variant: "info" | "warning" }> = {
  phone: { label: "Phone match", variant: "warning" },
  "name+dob": { label: "Name + DOB match", variant: "info" },
  name: { label: "Name match", variant: "info" },
};

export default async function PatientMergePage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [dupsRes, logsRes] = await Promise.all([
    apiJson<{ data: DupGroup[] }>(
      session,
      "/api/v1/admin/patients/duplicates?limit=20",
    ).catch(() => ({ data: [] as DupGroup[] })),
    apiJson<{ data: MergeLog[] }>(session, "/api/v1/admin/patients/merge").catch(
      () => ({ data: [] as MergeLog[] }),
    ),
  ]);

  const dups = dupsRes.data ?? [];
  const logs = logsRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("patient_merge.title")}
        description={t("patient_merge.subtitle")}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            {t("patient_merge.duplicates_heading")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dups.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={t("patient_merge.no_duplicates_title")}
              description={t("patient_merge.no_duplicates_desc")}
            />
          ) : (
            <div className="space-y-4">
              {dups.map((g, idx) => (
                <div
                  key={`${g.signal}-${idx}-${g.patients.map((p) => p.id).join("-")}`}
                  className="rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-between border-b px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={SIGNAL_LABEL[g.signal].variant}>
                        {SIGNAL_LABEL[g.signal].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {g.patients.length} {t("patient_merge.patients_in_group")}
                      </span>
                    </div>
                    <MergeDialog group={g} />
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("patients.hn")}</TableHead>
                        <TableHead>{t("patient_merge.full_name")}</TableHead>
                        <TableHead>{t("common.created_at")}</TableHead>
                        <TableHead className="text-right">{t("patient_merge.appointments")}</TableHead>
                        <TableHead className="text-right">{t("patient_merge.visits")}</TableHead>
                        <TableHead className="text-right">{t("patient_merge.invoices")}</TableHead>
                        <TableHead className="text-right">{t("patient_merge.wallets")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.patients.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.hn}</TableCell>
                          <TableCell>
                            {p.firstName} {p.lastName}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(p.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">{p.appointmentCount}</TableCell>
                          <TableCell className="text-right">{p.visitCount}</TableCell>
                          <TableCell className="text-right">{p.invoiceCount}</TableCell>
                          <TableCell className="text-right">{p.walletCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t("patient_merge.history_heading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<GitMerge className="h-5 w-5" />}
              title={t("patient_merge.no_history")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.created_at")}</TableHead>
                  <TableHead>{t("patient_merge.from")}</TableHead>
                  <TableHead>{t("patient_merge.into")}</TableHead>
                  <TableHead>{t("patient_merge.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(l.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.fromPatientId}</TableCell>
                    <TableCell className="font-mono text-xs">{l.intoPatientId}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs">
                      {l.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
