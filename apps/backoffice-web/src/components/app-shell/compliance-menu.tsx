"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import { cn } from "@/lib/utils";

interface ComplianceItem {
  href: string;
  labelKey: string;
  /** Iconify name (Fluent Emoji Flat). */
  icon: string;
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
    icon: "fluent-emoji-flat:magnifying-glass-tilted-right",
    tone: "bg-emerald-500/10",
    roles: ["MANAGER"],
  },
  {
    href: "/break-glass",
    labelKey: "nav.break_glass",
    icon: "fluent-emoji-flat:police-car-light",
    tone: "bg-amber-500/10",
    roles: ["MANAGER"],
  },
  {
    href: "/manager/patients/merge",
    labelKey: "nav.patient_merge",
    icon: "fluent-emoji-flat:shuffle-tracks-button",
    tone: "bg-violet-500/10",
    roles: ["MANAGER"],
  },
  {
    href: "/manager/pdpa",
    labelKey: "nav.pdpa",
    icon: "fluent-emoji-flat:locked-with-key",
    tone: "bg-sky-500/10",
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
          {/* Trigger stays as a monochrome Lucide glyph so it blends with
              the rest of the topbar chrome (theme toggle, locale, etc.).
              Colorful Fluent Emoji icons live inside the popover. */}
          <ShieldCheck className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0"
      >
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <EmojiIcon icon="fluent-emoji-flat:shield" size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">
              {t("nav.compliance")}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t("compliance_menu.subtitle")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex flex-col items-center gap-2 rounded-xl border border-transparent p-3 text-center transition-all",
                "hover:-translate-y-[1px] hover:border-border hover:bg-accent/40",
              )}
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110",
                  item.tone,
                )}
              >
                <EmojiIcon icon={item.icon} size={28} />
              </span>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
                {t(item.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
