import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UserCog, Phone as PhoneIcon } from "lucide-react";
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
import { CreateUserDialog } from "./CreateUserDialog";
import { UserRowActions } from "./UserRowActions";

export const dynamic = "force-dynamic";

type AdminUser = {
  id: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  primaryRoleCode: string | null;
  fullName: string;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  roles: Array<{ code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
};

type Role = { id: string; code: string; name: string };

const STATUS_VARIANT: Record<AdminUser["status"], "success" | "muted" | "destructive"> = {
  ACTIVE: "success",
  INACTIVE: "muted",
  LOCKED: "destructive",
};

export default async function AdminUsersPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [usersRes, rolesRes] = await Promise.all([
    apiJson<{ data: AdminUser[] }>(session, "/api/v1/admin/users").catch(() => ({
      data: [] as AdminUser[],
    })),
    apiJson<{ data: Role[] }>(session, "/api/v1/admin/roles").catch(() => ({
      data: [] as Role[],
    })),
  ]);
  const users = usersRes.data;
  const roles = rolesRes.data;
  const allBranches = session.branches ?? [];

  const active = users.filter((u) => u.status === "ACTIVE").length;
  const locked = users.filter((u) => u.status === "LOCKED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin_users.title")}
        description={t("admin_users.subtitle")}
        actions={
          <CreateUserDialog
            roles={roles.map((r) => ({ code: r.code, name: r.name }))}
            branches={allBranches}
          />
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("admin_users.kpi_total")} value={users.length} tone="muted" />
        <Stat label={t("admin_users.kpi_active")} value={active} tone="success" />
        <Stat label={t("admin_users.kpi_locked")} value={locked} tone="destructive" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin_users.user")}</TableHead>
                <TableHead>{t("admin_users.roles")}</TableHead>
                <TableHead>{t("admin_users.branches")}</TableHead>
                <TableHead>{t("admin_users.status")}</TableHead>
                <TableHead>{t("admin_users.last_login")}</TableHead>
                <TableHead className="text-right">{t("admin_users.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <UserCog className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium">{u.fullName}</div>
                        <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          <PhoneIcon className="h-3 w-3" />
                          {u.phone ?? "—"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.primaryRoleCode ? (
                      <Badge variant="info" className="font-mono text-[10px]">
                        {u.primaryRoleCode}
                      </Badge>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.branches.length === 0 ? (
                        <span className="text-xs italic text-warning">no access</span>
                      ) : (
                        u.branches.map((b) => (
                          <Badge key={b.id} variant="outline" className="font-mono text-[10px]">
                            {b.code}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      user={u}
                      allRoles={roles.map((r) => ({ code: r.code, name: r.name }))}
                      allBranches={allBranches}
                    />
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
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${colour}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
