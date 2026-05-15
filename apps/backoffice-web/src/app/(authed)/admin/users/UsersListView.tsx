import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UserCog, Phone as PhoneIcon, Lock, Users } from "lucide-react";
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
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/utils";
import {
  makeListHrefBuilder,
  parseListSearchParams,
} from "@/lib/list-params";
import { CreateUserDialog } from "./CreateUserDialog";
import { UserRowActions } from "./UserRowActions";

type AdminUser = {
  id: string;
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

type Resp = {
  data: AdminUser[];
  pagination: { total: number; page: number; perPage: number };
};

const STATUS_VARIANT: Record<AdminUser["status"], "success" | "muted" | "destructive"> = {
  ACTIVE: "success",
  INACTIVE: "muted",
  LOCKED: "destructive",
};

/**
 * Shared list view used by both `/admin/users` and `/manager/staff` — these
 * two pages render the same underlying user list (the api-server applies a
 * Separation-of-Duties filter so MANAGER doesn't see ADMIN rows).
 */
export async function UsersListView({
  searchParams,
  basePath,
  titleKey,
  subtitleKey,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
  basePath: string;
  titleKey: "admin_users.title" | "manager_staff.title";
  subtitleKey: "admin_users.subtitle" | "manager_staff.subtitle";
}) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const { q, view, page, perPage } = parseListSearchParams(searchParams, {
    defaultPerPage: 24,
  });
  const pickStr = (k: string) => {
    const v = searchParams?.[k];
    return typeof v === "string" ? v : "";
  };
  const role = pickStr("role");
  const status = pickStr("status");

  const apiParams = new URLSearchParams();
  apiParams.set("page", String(page));
  apiParams.set("per_page", String(perPage));
  if (q) apiParams.set("q", q);
  if (role) apiParams.set("role", role);
  if (status) apiParams.set("status", status);

  const [usersRes, rolesRes] = await Promise.all([
    apiJson<Resp>(session, `/api/v1/admin/users?${apiParams}`).catch(
      () =>
        ({
          data: [] as AdminUser[],
          pagination: { total: 0, page: 1, perPage },
        }) as Resp,
    ),
    apiJson<{ data: Role[] }>(session, "/api/v1/admin/roles").catch(() => ({
      data: [] as Role[],
    })),
  ]);
  const users = usersRes.data;
  const total = usersRes.pagination.total;
  const roles = rolesRes.data;
  const allBranches = session.branches ?? [];
  const actorRoles = session.roles ?? [];

  const buildHref = makeListHrefBuilder(basePath, {
    q: q || undefined,
    role: role || undefined,
    status: status || undefined,
    view: view === "grid" ? "grid" : undefined,
    page,
    per_page: perPage,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t(titleKey)}
            {total > 0 && (
              <Badge variant="secondary" className="rounded-full px-2 text-xs">
                {total.toLocaleString()}
              </Badge>
            )}
          </span>
        }
        description={t(subtitleKey)}
        actions={
          <CreateUserDialog
            roles={roles.map((r) => ({ code: r.code, name: r.name }))}
            branches={allBranches}
            actorRoles={actorRoles}
          />
        }
      />

      <ListToolbar
        basePath={basePath}
        q={q}
        filters={{ role, status }}
        view={view}
        perPage={perPage}
        searchKey="q"
        searchPlaceholder={t("admin_users.search_placeholder")}
        showViewToggle
        selects={[
          {
            key: "role",
            label: t("admin_users.filter_role"),
            widthClass: "w-[150px]",
            options: roles.map((r) => ({ value: r.code, label: r.name })),
          },
          {
            key: "status",
            label: t("admin_users.filter_status"),
            widthClass: "w-[140px]",
            options: [
              { value: "ACTIVE", label: t("admin_users.status_active") },
              { value: "INACTIVE", label: t("admin_users.status_inactive") },
              { value: "LOCKED", label: t("admin_users.status_locked") },
            ],
          },
        ]}
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {users.length === 0 ? (
            <EmptyState
              className="m-6"
              icon={<Users className="h-5 w-5" />}
              title={t("admin_users.list_empty_title")}
              description={t("admin_users.list_empty_desc")}
            />
          ) : view === "grid" ? (
            <UserGrid
              users={users}
              roles={roles}
              allBranches={allBranches}
              actorRoles={actorRoles}
              t={t}
            />
          ) : (
            <UserTable
              users={users}
              roles={roles}
              allBranches={allBranches}
              actorRoles={actorRoles}
              t={t}
            />
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

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function UserTable({
  users,
  roles,
  allBranches,
  actorRoles,
  t,
}: {
  users: AdminUser[];
  roles: Role[];
  allBranches: Array<{ id: string; code: string; name: string }>;
  actorRoles: string[];
  t: Translator;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead>{t("admin_users.user")}</TableHead>
          <TableHead>{t("admin_users.roles")}</TableHead>
          <TableHead>{t("admin_users.branches")}</TableHead>
          <TableHead>{t("admin_users.status")}</TableHead>
          <TableHead>{t("admin_users.last_login")}</TableHead>
          <TableHead className="text-right">
            {t("admin_users.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id} className="transition-colors hover:bg-accent/40">
            <TableCell>
              <div className="flex items-center gap-3">
                <UserAvatar user={u} size={9} />
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
                  <span className="text-xs italic text-warning">
                    {t("admin_users.no_branch_access")}
                  </span>
                ) : (
                  u.branches.map((b) => (
                    <Badge
                      key={b.id}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
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
                actorRoles={actorRoles}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid view (5 columns at xl)
// ─────────────────────────────────────────────────────────────────────────────

function UserGrid({
  users,
  roles,
  allBranches,
  actorRoles,
  t,
}: {
  users: AdminUser[];
  roles: Role[];
  allBranches: Array<{ id: string; code: string; name: string }>;
  actorRoles: string[];
  t: Translator;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {users.map((u) => (
        <li
          key={u.id}
          className="group relative flex h-full flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft-lg"
        >
          <div className="absolute right-2 top-2">
            <UserRowActions
              user={u}
              allRoles={roles.map((r) => ({ code: r.code, name: r.name }))}
              allBranches={allBranches}
              actorRoles={actorRoles}
            />
          </div>

          <UserAvatar user={u} size={16} />

          <div className="min-w-0 space-y-1">
            <div className="truncate text-sm font-semibold leading-tight">
              {u.fullName}
            </div>
            <div className="flex items-center justify-center gap-1 font-mono text-[11px] text-muted-foreground">
              <PhoneIcon className="h-3 w-3" />
              {u.phone ?? "—"}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {u.primaryRoleCode && (
              <Badge variant="info" className="font-mono text-[10px]">
                {u.primaryRoleCode}
              </Badge>
            )}
            <Badge variant={STATUS_VARIANT[u.status]} className="text-[10px]">
              {u.status === "LOCKED" && <Lock className="h-2.5 w-2.5" />}
              {u.status}
            </Badge>
          </div>

          <div className="flex flex-wrap justify-center gap-1">
            {u.branches.length === 0 ? (
              <span className="text-[10px] italic text-warning">
                {t("admin_users.no_branch_access")}
              </span>
            ) : (
              u.branches.slice(0, 4).map((b) => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className="font-mono text-[10px]"
                >
                  {b.code}
                </Badge>
              ))
            )}
            {u.branches.length > 4 && (
              <Badge variant="muted" className="text-[10px]">
                +{u.branches.length - 4}
              </Badge>
            )}
          </div>

          <div className="mt-auto text-[10px] text-muted-foreground">
            {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}
          </div>
        </li>
      ))}
    </ul>
  );
}

function UserAvatar({ user, size }: { user: AdminUser; size: 9 | 16 }) {
  const sizeClass = size === 9 ? "h-9 w-9" : "h-16 w-16";
  const iconClass = size === 9 ? "h-4 w-4" : "h-6 w-6";
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-background shadow-soft`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-2 ring-background shadow-soft`}
    >
      <UserCog className={iconClass} />
    </div>
  );
}
