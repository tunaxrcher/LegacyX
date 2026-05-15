import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users, ArrowRight, CalendarDays, User as UserIcon } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { cn, formatDate, initials } from "@/lib/utils";
import { NewPatientDialog } from "./NewPatientDialog";
import { PatientFilters, type PatientViewMode } from "./PatientFilters";

export const dynamic = "force-dynamic";

type Patient = {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  dob: string | null;
  status: string;
  linePictureUrl: string | null;
};

type ListResp = {
  data: Patient[];
  pagination: { total: number; page: number; perPage: number };
};

const STATUS_VARIANT: Record<string, "success" | "muted" | "warning"> = {
  ACTIVE: "success",
  INACTIVE: "muted",
  MERGED: "warning",
};

const GENDER_TONE: Record<string, string> = {
  MALE: "bg-info/10 text-info-foreground [color:hsl(var(--info))]",
  FEMALE: "bg-destructive/10 [color:hsl(var(--destructive))]",
  OTHER: "bg-warning/15 [color:hsl(var(--warning))]",
  UNDISCLOSED: "bg-muted text-muted-foreground",
};

const VALID_GENDER = new Set(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]);
const VALID_STATUS = new Set(["ACTIVE", "INACTIVE", "MERGED"]);

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age < 0 || age > 130 ? null : age;
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    new?: string;
    gender?: string;
    status?: string;
    view?: string;
    page?: string;
    per_page?: string;
  };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  // Normalise inputs
  const q = (searchParams?.q ?? "").trim();
  const autoOpenNew = searchParams?.new === "1";
  const genderInput = (searchParams?.gender ?? "").toUpperCase();
  const statusInput = (searchParams?.status ?? "").toUpperCase();
  const gender = VALID_GENDER.has(genderInput) ? genderInput : "";
  const status = VALID_STATUS.has(statusInput) ? statusInput : "";
  const view: PatientViewMode =
    searchParams?.view === "grid" ? "grid" : "table";
  const pageRaw = Number(searchParams?.page ?? 1);
  const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
  const perPageRaw = Number(searchParams?.per_page ?? 25);
  const perPage = Math.min(
    100,
    Math.max(1, Number.isFinite(perPageRaw) ? perPageRaw : 25),
  );

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  if (q) apiParams.set("q", q);
  if (gender) apiParams.set("gender", gender);
  if (status) apiParams.set("status", status);

  const list = await apiJson<ListResp>(
    session,
    `/api/v1/patients?${apiParams}`,
  ).catch(
    () =>
      ({
        data: [] as Patient[],
        pagination: { total: 0, page: 1, perPage },
      }) as ListResp,
  );

  const total = list.pagination?.total ?? list.data.length;

  // Helper: build patients URL preserving current state, with overrides.
  const buildHref = (overrides: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      q: q || undefined,
      gender: gender || undefined,
      status: status || undefined,
      view: view === "grid" ? "grid" : undefined,
      page,
      per_page: perPage,
    };
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) {
        delete merged[k];
        continue;
      }
      merged[k] = v;
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "") continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `/patients?${qs}` : "/patients";
  };

  const canWrite =
    Array.isArray(session.roles) &&
    session.roles.some((r) =>
      ["MANAGER", "DOCTOR", "RECEPTION"].includes(r),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t("patients.title")}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t("patients.subtitle")}
        actions={
          canWrite ? <NewPatientDialog defaultOpen={autoOpenNew} /> : null
        }
      />

      <PatientFilters
        q={q}
        gender={gender}
        status={status}
        view={view}
        perPage={perPage}
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {list.data.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<Users className="h-5 w-5" />}
              title={
                q || gender || status
                  ? t("patients.list_empty_title")
                  : t("patients.empty_title")
              }
              description={
                q || gender || status
                  ? t("patients.list_empty_desc")
                  : t("patients.empty_desc")
              }
            />
          ) : view === "grid" ? (
            <PatientGrid patients={list.data} t={t} />
          ) : (
            <PatientTable patients={list.data} t={t} />
          )}

          {total > 0 && (
            <Pagination
              total={total}
              page={page}
              perPage={perPage}
              getPageHref={(p) => buildHref({ page: p })}
              getPerPageHref={(pp) => buildHref({ per_page: pp, page: 1 })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Table view
// ─────────────────────────────────────────────────────────────────────────────

function PatientTable({
  patients,
  t,
}: {
  patients: Patient[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead className="w-[110px]">{t("patients.hn")}</TableHead>
          <TableHead>{t("patients.name")}</TableHead>
          <TableHead className="w-[110px]">{t("patients.gender")}</TableHead>
          <TableHead className="w-[100px]">{t("patients.age")}</TableHead>
          <TableHead className="w-[110px]">{t("common.status")}</TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {patients.map((p) => {
          const fullName = `${p.firstName} ${p.lastName}`.trim();
          const age = calcAge(p.dob);
          return (
            <TableRow
              key={p.id}
              className="group transition-colors hover:bg-accent/40"
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                <Link
                  href={`/patients/${p.id}`}
                  className="hover:text-foreground hover:underline"
                >
                  {p.hn}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  href={`/patients/${p.id}`}
                  className="flex items-center gap-3"
                >
                  <Avatar className="h-9 w-9">
                    {p.linePictureUrl ? (
                      <AvatarImage src={p.linePictureUrl} alt={fullName} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {initials(fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium leading-none">
                      {fullName}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {p.dob ? formatDate(p.dob) : t("patients.age_unknown")}
                    </div>
                  </div>
                </Link>
              </TableCell>
              <TableCell>
                <GenderChip gender={p.gender} t={t} />
              </TableCell>
              <TableCell className="tabular-nums text-sm">
                {age != null
                  ? t("patients.age_value", { age })
                  : t("patients.age_unknown")}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>
                  {t.has(`patients.status_${p.status.toLowerCase()}` as never)
                    ? t(`patients.status_${p.status.toLowerCase()}` as never)
                    : p.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/patients/${p.id}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-accent hover:text-foreground"
                  aria-label={t("patients.open_profile")}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid view (≤5 cards per row at xl, scales down)
// ─────────────────────────────────────────────────────────────────────────────

function PatientGrid({
  patients,
  t,
}: {
  patients: Patient[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {patients.map((p) => {
        const fullName = `${p.firstName} ${p.lastName}`.trim();
        const age = calcAge(p.dob);
        const statusKey = `patients.status_${p.status.toLowerCase()}`;
        return (
          <li key={p.id}>
            <Link
              href={`/patients/${p.id}`}
              className="group flex h-full flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft-lg"
            >
              <Avatar className="h-16 w-16 ring-2 ring-background shadow-soft transition group-hover:ring-primary/20">
                {p.linePictureUrl ? (
                  <AvatarImage src={p.linePictureUrl} alt={fullName} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                  {initials(fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="w-full min-w-0 space-y-1">
                <div className="truncate text-sm font-semibold leading-tight">
                  {fullName}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  HN · {p.hn}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <GenderChip gender={p.gender} t={t} compact />
                {age != null && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {t("patients.age_value", { age })}
                  </span>
                )}
              </div>
              <Badge
                variant={STATUS_VARIANT[p.status] ?? "secondary"}
                className="mt-auto"
              >
                {t.has(statusKey as never)
                  ? t(statusKey as never)
                  : p.status}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small bits
// ─────────────────────────────────────────────────────────────────────────────

function GenderChip({
  gender,
  t,
  compact,
}: {
  gender: string | null;
  t: Awaited<ReturnType<typeof getTranslations>>;
  compact?: boolean;
}) {
  if (!gender) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const labelKey = `patients.gender_${gender.toLowerCase()}`;
  const label = t.has(labelKey as never) ? t(labelKey as never) : gender;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 font-medium",
        compact ? "py-0.5 text-[11px]" : "py-0.5 text-xs",
        GENDER_TONE[gender] ?? "bg-muted text-muted-foreground",
      )}
    >
      <UserIcon className="h-3 w-3 opacity-70" />
      {label}
    </span>
  );
}
