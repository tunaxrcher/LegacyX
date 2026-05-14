import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, MapPin, Clock } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { CreateBranchDialog } from "./CreateBranchDialog";
import { BranchRowActions } from "./BranchRowActions";

export const dynamic = "force-dynamic";

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export default async function AdminBranchesPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const branchesRes = await apiJson<{ data: Branch[] }>(
    session,
    "/api/v1/admin/branches",
  ).catch(() => ({ data: [] as Branch[] }));
  const branches = branchesRes.data;
  const active = branches.filter((b) => b.status === "ACTIVE").length;
  const inactive = branches.length - active;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin_branches.title")}
        description={t("admin_branches.subtitle")}
        actions={<CreateBranchDialog />}
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={t("admin_branches.kpi_total")}
          value={branches.length}
          tone="muted"
        />
        <Stat
          label={t("admin_branches.kpi_active")}
          value={active}
          tone="success"
        />
        <Stat
          label={t("admin_branches.kpi_inactive")}
          value={inactive}
          tone="muted"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin_branches.branch")}</TableHead>
                <TableHead>{t("admin_branches.address")}</TableHead>
                <TableHead>{t("admin_branches.timezone")}</TableHead>
                <TableHead>{t("admin_branches.status")}</TableHead>
                <TableHead>{t("admin_branches.updated_at")}</TableHead>
                <TableHead className="text-right">
                  {t("admin_branches.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{b.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {b.code}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.address ? (
                      <div className="flex items-start gap-1">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{b.address}</span>
                      </div>
                    ) : (
                      <span className="italic">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {b.timezone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={b.status === "ACTIVE" ? "success" : "muted"}
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(b.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <BranchRowActions branch={b} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "muted" | "destructive";
}) {
  const colour = {
    success: "text-success",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-bold ${colour}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
