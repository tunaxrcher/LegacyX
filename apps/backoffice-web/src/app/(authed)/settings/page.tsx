import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  DoorOpen,
  Sparkles,
  Package,
  UserCog,
  Bell,
  Key,
  Building2,
  AlertOctagon,
  ShieldOff,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SettingTile {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  tone: string;
  roles: string[];
}

interface SettingGroup {
  titleKey: string;
  descriptionKey: string;
  tiles: SettingTile[];
}

// Settings hub catalog. Each group only renders if at least one tile passes
// the role filter, and each tile is hidden for roles that can't access it.
// Backend ABAC is still the real authority — this just keeps the UI tidy.
const GROUPS: SettingGroup[] = [
  {
    titleKey: "settings_hub.group_clinic",
    descriptionKey: "settings_hub.group_clinic_desc",
    tiles: [
      {
        href: "/manager/resources",
        titleKey: "nav.manager_resources",
        descriptionKey: "settings_hub.tile_resources_desc",
        icon: DoorOpen,
        tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/services",
        titleKey: "nav.manager_services",
        descriptionKey: "settings_hub.tile_services_desc",
        icon: Sparkles,
        tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/catalog",
        titleKey: "nav.manager_catalog",
        descriptionKey: "settings_hub.tile_catalog_desc",
        icon: Package,
        tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/staff",
        titleKey: "nav.manager_staff",
        descriptionKey: "settings_hub.tile_staff_desc",
        icon: UserCog,
        tone: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/notifications",
        titleKey: "nav.manager_notifications",
        descriptionKey: "settings_hub.tile_notifications_desc",
        icon: Bell,
        tone: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
        roles: ["MANAGER"],
      },
    ],
  },
  {
    titleKey: "settings_hub.group_admin",
    descriptionKey: "settings_hub.group_admin_desc",
    tiles: [
      {
        href: "/admin/users",
        titleKey: "nav.admin_users",
        descriptionKey: "settings_hub.tile_admin_users_desc",
        icon: UserCog,
        tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
        roles: ["ADMIN"],
      },
      {
        href: "/admin/roles",
        titleKey: "nav.admin_roles",
        descriptionKey: "settings_hub.tile_admin_roles_desc",
        icon: Key,
        tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
        roles: ["ADMIN"],
      },
      {
        href: "/admin/branches",
        titleKey: "nav.admin_branches",
        descriptionKey: "settings_hub.tile_admin_branches_desc",
        icon: Building2,
        tone: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
        roles: ["ADMIN"],
      },
      {
        href: "/dlq",
        titleKey: "nav.dlq",
        descriptionKey: "settings_hub.tile_dlq_desc",
        icon: AlertOctagon,
        tone: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
        roles: ["ADMIN"],
      },
    ],
  },
];

const SETTINGS_ROLES = ["MANAGER", "ADMIN"];

export default async function SettingsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");

  const roles = session.roles ?? [];
  const t = await getTranslations();

  // Hard guard: receptionists / doctors / nurses / pharmacists can't open
  // any setting in this hub. Show a friendly EmptyState rather than 404.
  const canSeeAny = SETTINGS_ROLES.some((r) => roles.includes(r));
  if (!canSeeAny) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("settings_hub.title")}
          description={t("settings_hub.subtitle")}
        />
        <EmptyState
          icon={<ShieldOff className="h-5 w-5" />}
          title={t("settings_hub.no_access_title")}
          description={t("settings_hub.no_access_desc")}
        />
      </div>
    );
  }

  const visibleGroups = GROUPS
    .map((g) => ({
      ...g,
      tiles: g.tiles.filter((tile) => tile.roles.some((r) => roles.includes(r))),
    }))
    .filter((g) => g.tiles.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("settings_hub.title")}
        description={t("settings_hub.subtitle")}
      />

      {visibleGroups.map((group) => (
        <section key={group.titleKey} className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight">
              {t(group.titleKey)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(group.descriptionKey)}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <Link
                  key={tile.href}
                  href={tile.href}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-soft transition-all",
                    "hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-md",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      tile.tone,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {t(tile.titleKey)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(tile.descriptionKey)}
                    </span>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
