import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  UserCog,
  Key,
  AlertOctagon,
  Settings,
  ShieldCheck,
  Server,
  Database,
  ArrowUpRight,
  ActivitySquare,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Health = {
  status: string;
  checks: Record<string, { ok: boolean; ms?: number }>;
};
type AdminUser = { id: string; status: "ACTIVE" | "INACTIVE" | "LOCKED" };
type Role = { id: string };
type DlqItem = { id: string };

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [health, usersRes, rolesRes, dlqRes] = await Promise.all([
    apiJson<Health>(session, "/api/health").catch(() => null),
    apiJson<{ data: AdminUser[] }>(session, "/api/v1/admin/users").catch(
      () => ({ data: [] as AdminUser[] }),
    ),
    apiJson<{ data: Role[] }>(session, "/api/v1/admin/roles").catch(() => ({
      data: [] as Role[],
    })),
    apiJson<{ data: DlqItem[] }>(session, "/api/admin/dlq").catch(() => ({
      data: [] as DlqItem[],
    })),
  ]);

  const totalUsers = usersRes.data.length;
  const activeUsers = usersRes.data.filter((u) => u.status === "ACTIVE").length;
  const lockedUsers = usersRes.data.filter((u) => u.status === "LOCKED").length;
  const totalRoles = rolesRes.data.length;
  const dlqDepth = dlqRes.data.length;
  const apiOk = health?.status === "ok";
  const dbCheck = health?.checks?.db;

  const tiles = [
    {
      labelKey: "admin_overview.users",
      value: totalUsers,
      sub: t("admin_overview.active_x", { count: activeUsers }),
      href: "/admin/users",
      Icon: UserCog,
      tone: "info" as const,
    },
    {
      labelKey: "admin_overview.roles",
      value: totalRoles,
      sub: t("admin_overview.locked_x", { count: lockedUsers }),
      href: "/admin/roles",
      Icon: Key,
      tone: "muted" as const,
    },
    {
      labelKey: "admin_overview.dlq",
      value: dlqDepth,
      sub: t("admin_overview.events_failed"),
      href: "/dlq",
      Icon: AlertOctagon,
      tone: dlqDepth > 0 ? ("destructive" as const) : ("muted" as const),
    },
    {
      labelKey: "admin_overview.system_health",
      value: apiOk ? "OK" : "DOWN",
      sub: `DB ${dbCheck?.ms ?? "—"}ms`,
      href: "/settings",
      Icon: ActivitySquare,
      tone: apiOk ? ("success" as const) : ("destructive" as const),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("admin_overview.title")}
        description={t("admin_overview.subtitle")}
        actions={
          <>
            <Badge
              variant={apiOk ? "success" : "destructive"}
              className="gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {apiOk
                ? t("admin_overview.system_ok")
                : t("admin_overview.system_down")}
            </Badge>
            <Button asChild size="sm">
              <Link href="/admin/users">
                <UserCog className="h-4 w-4" />
                {t("admin_overview.cta_new_user")}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.labelKey} href={tile.href} className="group">
            <Card className="relative h-full overflow-hidden transition-all hover:shadow-soft-lg hover:-translate-y-0.5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(tile.labelKey as never)}
                </CardTitle>
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    tile.tone === "info" && "bg-primary/10 text-primary",
                    tile.tone === "success" && "bg-success/15 text-success",
                    tile.tone === "destructive" &&
                      "bg-destructive/10 text-destructive",
                    tile.tone === "muted" && "bg-muted text-muted-foreground",
                  )}
                >
                  <tile.Icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold tabular-nums tracking-tight">
                  {tile.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {tile.sub}
                </div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {t("common.view_all")} <ArrowUpRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t("admin_overview.quick_links")}
            </CardTitle>
            <CardDescription>{t("admin_overview.quick_links_d")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <QuickAction
              href="/admin/users"
              icon={UserCog}
              label={t("nav.admin_users")}
            />
            <QuickAction
              href="/admin/roles"
              icon={Key}
              label={t("nav.admin_roles")}
            />
            <QuickAction
              href="/dlq"
              icon={AlertOctagon}
              label={t("nav.dlq")}
              tone={dlqDepth > 0 ? "destructive" : undefined}
            />
            <QuickAction
              href="/settings"
              icon={Settings}
              label={t("nav.settings")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t("admin_overview.system_status")}
            </CardTitle>
            <CardDescription>
              {t("admin_overview.system_status_d")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              icon={Server}
              label={t("admin_overview.api_server")}
              ok={apiOk}
            />
            <StatusRow
              icon={Database}
              label={t("admin_overview.database")}
              ok={!!dbCheck?.ok}
              detail={dbCheck?.ms ? `${dbCheck.ms} ms` : undefined}
            />
            {health?.checks &&
              Object.entries(health.checks)
                .filter(([k]) => k !== "db")
                .map(([k, v]) => (
                  <StatusRow
                    key={k}
                    icon={ActivitySquare}
                    label={k}
                    ok={v.ok}
                    detail={v.ms ? `${v.ms} ms` : undefined}
                  />
                ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "destructive";
}) {
  return (
    <Button asChild variant="outline" className="h-12 w-full justify-start">
      <Link href={href}>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "destructive" && "text-destructive",
          )}
        />
        <span>{label}</span>
      </Link>
    </Button>
  );
}

function StatusRow({
  icon: Icon,
  label,
  ok,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            ok ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          {detail && (
            <div className="text-xs text-muted-foreground">{detail}</div>
          )}
        </div>
      </div>
      <Badge variant={ok ? "success" : "destructive"}>
        {ok ? "OK" : "DOWN"}
      </Badge>
    </div>
  );
}
