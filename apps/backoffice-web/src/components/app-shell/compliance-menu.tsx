"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ShieldCheck,
  ShieldAlert,
  GitMerge,
  ScrollText,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ComplianceItem {
  href: string;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon tile background. */
  tone: string;
  roles: string[];
}

// Single source of truth for the compliance/audit grid in the topbar.
// All items currently require MANAGER (matches the previous sidebar group).
const COMPLIANCE_ITEMS: ComplianceItem[] = [
  {
    href: "/audit",
    labelKey: "nav.audit",
    descriptionKey: "compliance_menu.audit_desc",
    icon: ShieldCheck,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    roles: ["MANAGER"],
  },
  {
    href: "/break-glass",
    labelKey: "nav.break_glass",
    descriptionKey: "compliance_menu.break_glass_desc",
    icon: ShieldAlert,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    roles: ["MANAGER"],
  },
  {
    href: "/manager/patients/merge",
    labelKey: "nav.patient_merge",
    descriptionKey: "compliance_menu.patient_merge_desc",
    icon: GitMerge,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    roles: ["MANAGER"],
  },
  {
    href: "/manager/pdpa",
    labelKey: "nav.pdpa",
    descriptionKey: "compliance_menu.pdpa_desc",
    icon: ScrollText,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    roles: ["MANAGER"],
  },
];

function visibleItems(roles: string[]): ComplianceItem[] {
  return COMPLIANCE_ITEMS.filter((it) => it.roles.some((r) => roles.includes(r)));
}

export function ComplianceMenu({ roles = [] }: { roles?: string[] }) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const items = visibleItems(roles);

  // Hide entirely if user has no compliance access (e.g. RECEPTION, DOCTOR).
  if (items.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("nav.compliance")}
          title={t("nav.compliance")}
          className="relative"
        >
          <ShieldQuestion className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{t("nav.compliance")}</span>
            <span className="text-xs text-muted-foreground">
              {t("compliance_menu.subtitle")}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-xl border border-transparent p-3 text-center transition-colors",
                  "hover:border-border hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full",
                    item.tone,
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
