"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Sparkles,
  AlertOctagon,
  Settings,
  Stethoscope,
  Activity,
  Package,
  ShieldCheck,
  ShieldAlert,
  DoorOpen,
  PillBottle,
  UserCog,
  Key,
  TrendingUp,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Role codes that may see this item. If undefined → visible to everyone authenticated. */
  roles?: string[];
}
interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

// Single source of truth for which role sees which menu item.
// ABAC on the API still enforces real authority — this is just for tidy UX.
//
// Design rule: **ADMIN sees ONLY the System Admin group** (separation of
// duties — sysadmins configure the system, they don't run daily operations).
// If an admin needs to test operational flows, log in as the relevant role
// or assign the user multiple roles via /admin/users.
const OPERATIONAL_ROLES = ["MANAGER", "DOCTOR", "NURSE", "RECEPTION", "PHARMACIST"];

const groups: NavGroup[] = [
  // Daily operational tools — for clinical/business roles (not ADMIN)
  {
    titleKey: "nav.operations",
    items: [
      {
        href: "/",
        labelKey: "nav.dashboard",
        icon: LayoutDashboard,
        roles: OPERATIONAL_ROLES,
      },
      {
        href: "/appointments",
        labelKey: "nav.appointments",
        icon: CalendarDays,
        roles: ["MANAGER", "DOCTOR", "NURSE", "RECEPTION"],
      },
      {
        href: "/visits",
        labelKey: "nav.visits",
        icon: Activity,
        roles: ["MANAGER", "DOCTOR", "NURSE", "RECEPTION"],
      },
      {
        href: "/patients",
        labelKey: "nav.patients",
        icon: Users,
        roles: OPERATIONAL_ROLES,
      },
      {
        href: "/resources",
        labelKey: "nav.resources",
        icon: DoorOpen,
        roles: ["MANAGER", "NURSE", "RECEPTION"],
      },
    ],
  },
  // Clinical work — doctors, nurses, pharmacists
  {
    titleKey: "nav.clinical",
    items: [
      {
        href: "/ai-drafts",
        labelKey: "nav.ai_drafts",
        icon: Sparkles,
        roles: ["MANAGER", "DOCTOR"],
      },
      // EMR sign-off now lives inside the Visit detail page (SOAP tab).
      // Standalone /emr/sign page is deprecated but still reachable for
      // legacy linking. Removed from sidebar for better UX.
      {
        href: "/pharmacy",
        labelKey: "nav.pharmacy",
        icon: PillBottle,
        roles: ["PHARMACIST"],
      },
    ],
  },
  // Stock & supplies
  {
    titleKey: "nav.stock",
    items: [
      {
        href: "/inventory",
        labelKey: "nav.inventory",
        icon: Package,
        roles: ["MANAGER", "NURSE", "PHARMACIST"],
      },
    ],
  },
  // Manager scope — financial insights, governance, oversight
  {
    titleKey: "nav.finance",
    items: [
      {
        href: "/manager",
        labelKey: "nav.manager_dashboard",
        icon: TrendingUp,
        roles: ["MANAGER"],
      },
      {
        href: "/manager/catalog",
        labelKey: "nav.manager_catalog",
        icon: Package,
        roles: ["MANAGER", "ADMIN"],
      },
      {
        href: "/audit",
        labelKey: "nav.audit",
        icon: ShieldCheck,
        roles: ["MANAGER"],
      },
      {
        href: "/break-glass",
        labelKey: "nav.break_glass",
        icon: ShieldAlert,
        roles: ["MANAGER"],
      },
    ],
  },
  // System administration — ADMIN-only universe
  {
    titleKey: "nav.admin",
    items: [
      {
        href: "/admin/users",
        labelKey: "nav.admin_users",
        icon: UserCog,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/roles",
        labelKey: "nav.admin_roles",
        icon: Key,
        roles: ["ADMIN"],
      },
      {
        href: "/admin/resources",
        labelKey: "nav.admin_resources",
        icon: DoorOpen,
        roles: ["ADMIN"],
      },
      {
        href: "/dlq",
        labelKey: "nav.dlq",
        icon: AlertOctagon,
        roles: ["ADMIN"],
      },
      {
        href: "/settings",
        labelKey: "nav.settings",
        icon: Settings,
        roles: ["ADMIN"],
      },
    ],
  },
];

function canSee(item: NavItem, roles: string[]): boolean {
  if (!item.roles) return true;
  return item.roles.some((r) => roles.includes(r));
}

export function Sidebar({ roles = [] }: { roles?: string[] }) {
  const pathname = usePathname();
  const tNav = useTranslations();
  const tApp = useTranslations("app");
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] md:flex",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Stethoscope className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{tApp("name")}</span>
            <span className="truncate text-[11px] text-sidebar-foreground/60">
              {tApp("tagline")}
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4 scrollbar-thin">
        {groups.map((group) => {
          const visible = group.items.filter((it) => canSee(it, roles));
          if (visible.length === 0) return null;
          return (
          <div key={group.titleKey}>
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                {tNav(group.titleKey)}
              </p>
            )}
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? tNav(item.labelKey) : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{tNav(item.labelKey)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
