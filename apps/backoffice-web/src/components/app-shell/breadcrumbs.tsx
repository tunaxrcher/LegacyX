"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Home } from "lucide-react";

const labelMap: Record<string, string> = {
  appointments: "nav.appointments",
  patients: "nav.patients",
  "ai-drafts": "nav.ai_drafts",
  emr: "nav.clinical",
  sign: "nav.emr_sign",
  dlq: "nav.dlq",
  settings: "nav.settings",
};

export function Breadcrumbs() {
  const pathname = usePathname() ?? "/";
  const t = useTranslations();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        href="/"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
      >
        <Home className="h-3 w-3" /> {t("nav.dashboard")}
      </Link>
      {segments.map((seg, idx) => {
        const href = "/" + segments.slice(0, idx + 1).join("/");
        const key = labelMap[seg];
        const label = key ? t(key) : decodeURIComponent(seg);
        return (
          <React.Fragment key={href}>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <Link
              href={href}
              className="rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
            >
              {label}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
