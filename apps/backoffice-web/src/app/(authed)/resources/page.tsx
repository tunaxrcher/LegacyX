import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Hotel, Plus } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCard, type ResourceRow } from "./ResourceCard";
import { CreateResourceDialog } from "./CreateResourceDialog";

export const dynamic = "force-dynamic";

type ApiResource = {
  id: string;
  type: "ROOM" | "MACHINE" | "THERAPIST" | "LASER" | "OTHER";
  code: string;
  name: string;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "RETIRED";
  rawStatus: string;
  attributes: { floor?: number; subtype?: string } | null;
  activeReservation: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    appointmentId: string | null;
    occupant: { name: string; hn: string } | null;
  } | null;
};

function groupByFloor(rows: ApiResource[]): Map<number, ApiResource[]> {
  const m = new Map<number, ApiResource[]>();
  for (const r of rows) {
    const f = Number(r.attributes?.floor ?? 0);
    const arr = m.get(f) ?? [];
    arr.push(r);
    m.set(f, arr);
  }
  // Sort by floor asc, items by code asc
  for (const [k, arr] of m.entries()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
    m.set(k, arr);
  }
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const qs = new URLSearchParams();
  if (searchParams.type) qs.set("type", searchParams.type);

  const res = await apiJson<{ data: ApiResource[] }>(
    session,
    `/api/v1/resources?${qs.toString()}`,
  ).catch(() => ({ data: [] as ApiResource[] }));
  const rows = res.data;
  const grouped = groupByFloor(rows);

  // Stats
  const total = rows.length;
  const occupied = rows.filter((r) => r.status === "OCCUPIED").length;
  const maintenance = rows.filter((r) => r.status === "MAINTENANCE").length;
  const available = rows.filter((r) => r.status === "AVAILABLE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("resources.title")}
        description={t("resources.subtitle")}
        actions={<CreateResourceDialog />}
      />

      {/* Quick KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label={t("resources.kpi_total")} value={total} tone="muted" />
        <KpiTile label={t("resources.kpi_available")} value={available} tone="success" />
        <KpiTile label={t("resources.kpi_occupied")} value={occupied} tone="info" />
        <KpiTile label={t("resources.kpi_maintenance")} value={maintenance} tone="warning" />
      </div>

      {/* Filter chips */}
      <FilterChips active={searchParams.type} />

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              className="my-6"
              icon={<Hotel className="h-5 w-5" />}
              title={t("resources.empty_title")}
              description={t("resources.empty_desc")}
              action={<CreateResourceDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([floor, items]) => (
          <Card key={floor}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-2">
                <Hotel className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  {floor === 0
                    ? t("resources.unassigned_floor")
                    : t("resources.floor", { n: floor })}
                </h3>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((r) => (
                  <ResourceCard key={r.id} resource={r as ResourceRow} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "warning" | "muted";
}) {
  const colour = {
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${colour}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterChips({ active }: { active?: string }) {
  const items = [
    { value: "", label: "All" },
    { value: "ROOM", label: "Rooms" },
    { value: "LASER", label: "Lasers" },
    { value: "MACHINE", label: "Machines" },
    { value: "THERAPIST", label: "Therapists" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const isActive = (active ?? "") === it.value;
        const href = it.value ? `/resources?type=${it.value}` : "/resources";
        return (
          <a
            key={it.value || "all"}
            href={href}
            className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {it.label}
          </a>
        );
      })}
    </div>
  );
}
