import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DoorOpen, Settings2 } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { CreateResourceDialog } from "../../resources/CreateResourceDialog";
import { AdminResourceActions } from "./AdminResourceActions";

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
  activeReservation: unknown;
};

const STATUS_VARIANT: Record<
  ApiResource["status"],
  "success" | "info" | "warning" | "muted"
> = {
  AVAILABLE: "success",
  OCCUPIED: "info",
  MAINTENANCE: "warning",
  RETIRED: "muted",
};

export default async function AdminResourcesPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  // Include retired so admin can see/restore them
  const res = await apiJson<{ data: ApiResource[] }>(
    session,
    "/api/v1/resources?include_retired=true",
  ).catch(() => ({ data: [] as ApiResource[] }));
  const rows = res.data;

  // Group by type for cleaner admin view
  const grouped = new Map<string, ApiResource[]>();
  for (const r of rows) {
    const arr = grouped.get(r.type) ?? [];
    arr.push(r);
    grouped.set(r.type, arr);
  }
  for (const [k, arr] of grouped.entries()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
    grouped.set(k, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin_resources.title")}
        description={t("admin_resources.subtitle")}
        actions={<CreateResourceDialog />}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              className="my-6"
              icon={<DoorOpen className="h-5 w-5" />}
              title={t("admin_resources.empty_title")}
              description={t("admin_resources.empty_desc")}
              action={<CreateResourceDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([type, items]) => (
          <Card key={type}>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{type}</h3>
                <Badge variant="muted">{items.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin_resources.code")}</TableHead>
                    <TableHead>{t("admin_resources.name")}</TableHead>
                    <TableHead>{t("admin_resources.floor")}</TableHead>
                    <TableHead>{t("admin_resources.subtype")}</TableHead>
                    <TableHead className="text-right">
                      {t("admin_resources.capacity")}
                    </TableHead>
                    <TableHead>{t("admin_resources.status")}</TableHead>
                    <TableHead className="text-right">
                      {t("admin_resources.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.attributes?.floor ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.attributes?.subtype ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.capacity}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.rawStatus as ApiResource["status"]] ?? "muted"}>
                          {r.rawStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <AdminResourceActions
                          resource={{
                            id: r.id,
                            code: r.code,
                            name: r.name,
                            capacity: r.capacity,
                            floor: r.attributes?.floor,
                            subtype: r.attributes?.subtype,
                            status: r.rawStatus as ApiResource["status"],
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
