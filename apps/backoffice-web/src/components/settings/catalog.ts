/**
 * Single source of truth for the Settings hub. Used by:
 *  • `SettingsDialog` — the popup launched from the sidebar
 *  • `/settings/page.tsx` — the deep-link fallback page
 *
 * Every consumer must filter by `tile.roles` against the current session
 * roles. The backend ABAC layer is still the real authority — this is just
 * for tidy UX (don't dangle inaccessible links in the user's face).
 *
 * Icons use Iconify names (`<collection>:<name>`), mostly Microsoft Fluent
 * Emoji Flat for the colorful "branded" look. Browse the catalog at
 * https://icon-sets.iconify.design/fluent-emoji-flat/ to find new icons.
 */
export interface SettingTile {
  href: string;
  titleKey: string;
  descriptionKey: string;
  /** Iconify icon name, e.g. `"fluent-emoji-flat:hospital"`. */
  icon: string;
  /** Tailwind classes for the icon tile background (the icon itself is colorful). */
  tone: string;
  roles: string[];
}

export interface SettingGroup {
  titleKey: string;
  descriptionKey: string;
  /** Iconify icon name for the group header. */
  icon: string;
  /** Tailwind classes for the group header icon tile background. */
  tone: string;
  tiles: SettingTile[];
}

export const SETTINGS_GROUPS: SettingGroup[] = [
  {
    titleKey: "settings_hub.group_clinic",
    descriptionKey: "settings_hub.group_clinic_desc",
    icon: "fluent-emoji-flat:hospital",
    tone: "bg-fuchsia-500/10",
    tiles: [
      {
        href: "/manager/resources",
        titleKey: "nav.manager_resources",
        descriptionKey: "settings_hub.tile_resources_desc",
        icon: "fluent-emoji-flat:hospital",
        tone: "bg-sky-500/10",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/services",
        titleKey: "nav.manager_services",
        descriptionKey: "settings_hub.tile_services_desc",
        icon: "fluent-emoji-flat:sparkles",
        tone: "bg-fuchsia-500/10",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/catalog",
        titleKey: "nav.manager_catalog",
        descriptionKey: "settings_hub.tile_catalog_desc",
        icon: "fluent-emoji-flat:pill",
        tone: "bg-emerald-500/10",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/staff",
        titleKey: "nav.manager_staff",
        descriptionKey: "settings_hub.tile_staff_desc",
        icon: "fluent-emoji-flat:woman-health-worker",
        tone: "bg-amber-500/10",
        roles: ["MANAGER"],
      },
      {
        href: "/manager/notifications",
        titleKey: "nav.manager_notifications",
        descriptionKey: "settings_hub.tile_notifications_desc",
        icon: "fluent-emoji-flat:bell",
        tone: "bg-rose-500/10",
        roles: ["MANAGER"],
      },
    ],
  },
  {
    titleKey: "settings_hub.group_admin",
    descriptionKey: "settings_hub.group_admin_desc",
    icon: "fluent-emoji-flat:gear",
    tone: "bg-indigo-500/10",
    tiles: [
      {
        href: "/admin/users",
        titleKey: "nav.admin_users",
        descriptionKey: "settings_hub.tile_admin_users_desc",
        icon: "fluent-emoji-flat:identification-card",
        tone: "bg-violet-500/10",
        roles: ["ADMIN"],
      },
      {
        href: "/admin/roles",
        titleKey: "nav.admin_roles",
        descriptionKey: "settings_hub.tile_admin_roles_desc",
        icon: "fluent-emoji-flat:key",
        tone: "bg-indigo-500/10",
        roles: ["ADMIN"],
      },
      {
        href: "/admin/branches",
        titleKey: "nav.admin_branches",
        descriptionKey: "settings_hub.tile_admin_branches_desc",
        icon: "fluent-emoji-flat:office-building",
        tone: "bg-teal-500/10",
        roles: ["ADMIN"],
      },
      {
        href: "/dlq",
        titleKey: "nav.dlq",
        descriptionKey: "settings_hub.tile_dlq_desc",
        icon: "fluent-emoji-flat:warning",
        tone: "bg-orange-500/10",
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
