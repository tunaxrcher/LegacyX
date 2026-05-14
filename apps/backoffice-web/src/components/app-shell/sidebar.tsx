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
  Sparkles,
  AlertOctagon,
  Settings,
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
  Banknote,
  Bell,
  GitMerge,
  ScrollText,
  Tag,
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
        roles: ["MANAGER"],
      },
      {
        href: "/manager/eod",
        labelKey: "nav.manager_eod",
        icon: Banknote,
        roles: ["MANAGER", "RECEPTION"],
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
      // Phase K — Patient deduplication. MANAGER scope per ROLE_MATRIX
      // (`patient:merge:tenant`). Doctor/Reception cannot merge.
      {
        href: "/admin/patients",
        labelKey: "nav.patient_merge",
        icon: GitMerge,
        roles: ["MANAGER"],
      },
      // Phase O — Promotion engine. MANAGER owns campaigns; reception just
      // redeems them via /api/v1/invoices/:id/apply-promo.
      {
        href: "/manager/promotions",
        labelKey: "nav.promotions",
        icon: Tag,
        roles: ["MANAGER"],
      },
    ],
  },
  // Clinic configuration — Manager owns the day-to-day business setup
  // (rooms, services, notifications). NOT shown to ADMIN — admin is for
  // system configuration only (users / roles / DLQ / system settings).
  {
    titleKey: "nav.clinic_setup",
    items: [
      {
        href: "/admin/resources",
        labelKey: "nav.admin_resources",
        icon: DoorOpen,
        roles: ["MANAGER"],
      },
      {
        href: "/admin/services",
        labelKey: "nav.admin_services",
        icon: Sparkles,
        roles: ["MANAGER"],
      },
      {
        href: "/admin/notifications",
        labelKey: "nav.admin_notifications",
        icon: Bell,
        roles: ["MANAGER"],
      },
    ],
  },
  // System administration — ADMIN-only universe. Clinic operational config
  // (rooms / services / notifications) moved to "clinic_setup" group above
  // and is now MANAGER-owned. Admin handles only user/role/system plumbing.
  {
    titleKey: "nav.admin",
    items: [
      {
        href: "/admin",
        labelKey: "nav.admin_overview",
        icon: LayoutDashboard,
        roles: ["ADMIN"],
      },
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
        href: "/dlq",
        labelKey: "nav.dlq",
        icon: AlertOctagon,
        roles: ["ADMIN"],
      },
      // Phase K — PDPA Data Subject Rights (export / anonymise). ADMIN-only
      // because the feature decrypts every PII field for the patient and
      // generates a downloadable archive.
      {
        href: "/admin/pdpa",
        labelKey: "nav.pdpa",
        icon: ScrollText,
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

      <div className="border-t border-sidebar-border p-3">
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
