import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PatientSearch } from "./PatientSearch";
import { NewPatientDialog } from "./NewPatientDialog";

export const dynamic = "force-dynamic";

type Patient = {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  status: string;
};

export default async function PatientsPage({
  searchParams,
}: {
  searchParams?: { q?: string; new?: string };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const q = searchParams?.q ?? "";
  const autoOpenNew = searchParams?.new === "1";
  const list = await apiJson<{ data: Patient[] }>(
    session,
    `/api/v1/patients?q=${encodeURIComponent(q)}&limit=50`
  ).catch(() => ({ data: [] as Patient[] }));

  const canWrite =
    Array.isArray(session.roles) &&
    session.roles.some((r) =>
      ["MANAGER", "DOCTOR", "RECEPTION"].includes(r),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("patients.title")}
        description={t("patients.subtitle")}
        actions={
          canWrite ? <NewPatientDialog defaultOpen={autoOpenNew} /> : null
        }
      />

      <PatientSearch defaultValue={q} />

      <Card>
        <CardContent className="p-0">
          {list.data.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<Users className="h-5 w-5" />}
              title={t("patients.empty_title")}
              description={t("patients.empty_desc")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("patients.hn")}</TableHead>
                  <TableHead>{t("patients.name")}</TableHead>
                  <TableHead>{t("patients.gender")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/patients/${p.id}`} className="hover:underline">
                        {p.hn}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/patients/${p.id}`} className="font-medium hover:underline">
                        {p.firstName} {p.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.gender ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "ACTIVE" ? "success" : "muted"}>
                        {p.status}
                      </Badge>
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
