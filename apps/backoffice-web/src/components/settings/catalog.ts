import {
  DoorOpen,
  Sparkles,
  Package,
  UserCog,
  Bell,
  Key,
  Building2,
  AlertOctagon,
  Hotel,
  ServerCog,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the Settings hub. Used by:
 *  • `SettingsDialog` — the popup launched from the sidebar
 *  • `/settings/page.tsx` — the deep-link fallback page
 *
 * Every consumer must filter by `tile.roles` against the current session
 * roles. The backend ABAC layer is still the real authority — this is just
 * for tidy UX (don't dangle inaccessible links in the user's face).
 */
export interface SettingTile {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile (background + foreground colors). */
  tone: string;
  roles: string[];
}

export interface SettingGroup {
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  /** Tailwind classes for the group header icon tile. */
  tone: string;
  tiles: SettingTile[];
}

export const SETTINGS_GROUPS: SettingGroup[] = [
  {
    titleKey: "settings_hub.group_clinic",
    descriptionKey: "settings_hub.group_clinic_desc",
    icon: Hotel,
    tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300",
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
    icon: ServerCog,
    tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
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

/** Roles allowed to see the Settings entry point at all. */
export const SETTINGS_ROLES = ["MANAGER", "ADMIN"];

/** Filter the catalog down to what the given roles can see. */
export function visibleGroups(roles: string[]): SettingGroup[] {
  return SETTINGS_GROUPS
    .map((g) => ({
      ...g,
      tiles: g.tiles.filter((tile) => tile.roles.some((r) => roles.includes(r))),
    }))
    .filter((g) => g.tiles.length > 0);
}
