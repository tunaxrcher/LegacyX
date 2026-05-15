"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Settings,
  Activity,
  Package,
  DoorOpen,
  PillBottle,
  TrendingUp,
  ChevronsLeft,
  ChevronsRight,
  Banknote,
  FileBarChart2,
  Tag,
  BookOpen,
  LifeBuoy,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WorkflowDialog } from "@/components/workflow/workflow-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";

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
  // (AI Assistant is now inside the SOAP tab; the old /ai-drafts viewer was
  // removed in C2 of the UX cleanup pass.)
  {
    titleKey: "nav.clinical",
    items: [
      {
        href: "/pharmacy",
        labelKey: "nav.pharmacy",
        icon: PillBottle,
        // MANAGER has read-only oversight (no dispense button).
        roles: ["MANAGER", "PHARMACIST"],
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
  // Manager — Finance & operational dashboards.
  // Pure money-flow stuff — KPIs, end-of-day reconciliation. Configuration
  // (catalog, staff, rooms, services) lives in the `/settings` hub.
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
        href: "/manager/eod",
        labelKey: "nav.manager_eod",
        icon: Banknote,
        roles: ["MANAGER", "RECEPTION"],
      },
      {
        href: "/manager/reports",
        labelKey: "nav.manager_reports",
        icon: FileBarChart2,
        roles: ["MANAGER"],
      },
    ],
  },
  // Manager — Marketing & growth (Phase O onwards)
  {
    titleKey: "nav.marketing",
    items: [
      {
        href: "/manager/promotions",
        labelKey: "nav.promotions",
        icon: Tag,
        roles: ["MANAGER"],
      },
    ],
  },
  // NOTE: The "Compliance & Audit" group (Audit log, Break-glass, Patient
  // merge, PDPA) was moved from the sidebar into the topbar `ComplianceMenu`
  // popover (see `compliance-menu.tsx`) to declutter the left rail.
  //
  // NOTE: The "Clinic Setup" group (rooms / services / catalog / staff /
  // notifications) and the configuration items in "System Admin" (users /
  // roles / branches / DLQ) were moved into the `/settings` hub page so the
  // sidebar isn't a wall of links. The hub renders cards filtered by role.
  // Only `/admin` (the ADMIN-only landing dashboard) remains in the sidebar
  // since it's a dashboard, not a setting.
  {
    titleKey: "nav.admin",
    items: [
      {
        href: "/admin",
        labelKey: "nav.admin_overview",
        icon: LayoutDashboard,
        roles: ["ADMIN"],
      },
    ],
  },
];

// Roles that can see the "Settings" hub at the bottom of the sidebar.
// MANAGER owns clinic configuration; ADMIN owns system configuration.
// Receptionists / doctors / nurses / pharmacists never need Settings.
const SETTINGS_ROLES = ["MANAGER", "ADMIN"];

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
        collapsed ? "w-[76px]" : "w-[260px]"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <Link
          href="/"
          aria-label={tApp("name")}
          className="flex min-w-0 items-center"
        >
          <Image
            src="/logo.png"
            alt={tApp("name")}
            width={1000}
            height={234}
            priority
            className={cn(
              "h-auto w-auto object-contain",
              collapsed ? "max-h-9 max-w-[52px]" : "max-h-10 max-w-[200px]",
            )}
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5 scrollbar-thin">
        {groups.map((group) => {
          const visible = group.items.filter((it) => canSee(it, roles));
          if (visible.length === 0) return null;
          return (
            <div key={group.titleKey}>
              {!collapsed && (
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {tNav(group.titleKey)}
                </p>
              )}
              <ul className="space-y-1">
                {visible.map((item) => {
                  const Icon = item.icon;
                  // Exact-match-only hrefs (overview pages whose path is a
                  // prefix of other sub-pages, so a startsWith match would
                  // light up the wrong tab).
                  const exact = item.href === "/" || item.href === "/admin";
                  const active = exact
                    ? pathname === item.href
                    : pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? tNav(item.labelKey) : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                          collapsed && "justify-center px-0"
                        )}
                      >
                        {/* Active indicator bar on the left */}
                        {active && !collapsed && (
                          <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-gradient" />
                        )}
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
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

      <div className="space-y-1 border-t border-sidebar-border p-3">
        {/* Support — placeholder until the helpdesk integration ships.
            Kept visible (dimmed) so users discover the upcoming surface. */}
        <BottomItem
          icon={LifeBuoy}
          label={tNav("nav.support")}
          collapsed={collapsed}
          disabled
        />

        {/* Settings — opens a dialog with role-filtered tiles instead of
            navigating to a separate page. Faster UX and keeps the user
            in their current context. /settings still works as a deep-link
            fallback. Visible to MANAGER + ADMIN only. */}
        {SETTINGS_ROLES.some((r) => roles.includes(r)) && (
          <SettingsDialog
            roles={roles}
            trigger={
              <button
                type="button"
                title={collapsed ? tNav("nav.settings") : undefined}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Settings className="h-[14px] w-[14px] shrink-0" />
                {!collapsed && (
                  <span className="truncate">{tNav("nav.settings")}</span>
                )}
              </button>
            }
          />
        )}

        {/* Feedback — placeholder until the in-product feedback widget ships. */}
        <BottomItem
          icon={MessageSquareText}
          label={tNav("nav.feedback")}
          collapsed={collapsed}
          disabled
        />

        {/* Workflow guide — opens a Dialog explaining how every role plays
            together end-to-end. Visible to every authenticated user since
            it doubles as onboarding documentation. */}
        <WorkflowDialog
          trigger={
            <button
              type="button"
              title={collapsed ? tNav("nav.workflow") : undefined}
              className={cn(
                "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <BookOpen className="h-[14px] w-[14px] shrink-0" />
              {!collapsed && <span className="truncate">{tNav("nav.workflow")}</span>}
            </button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-1 text-xs"></span>}
        </Button>
      </div>
    </aside>
  );
}

// Small reusable row for the bottom cluster (Support / Settings / Feedback).
// Three states: disabled placeholder, active link, inactive link.
function BottomItem({
  icon: Icon,
  label,
  collapsed,
  href,
  active = false,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  href?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const baseClass = cn(
    "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
    collapsed && "justify-center px-0",
    disabled
      ? "cursor-not-allowed text-muted-foreground/40"
      : active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
  );

  const inner = (
    <>
      <Icon className="h-[14px] w-[14px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  if (disabled || !href) {
    return (
      <button
        type="button"
        disabled
        title={collapsed ? label : undefined}
        aria-disabled
        className={baseClass}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} title={collapsed ? label : undefined} className={baseClass}>
      {inner}
    </Link>
  );
}
