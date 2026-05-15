"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { visibleGroups } from "./catalog";

interface SettingsDialogProps {
  /** Session role codes — controls which groups & tiles render. */
  roles: string[];
  /** Replaces the default trigger button (used by the sidebar). */
  trigger: React.ReactNode;
}

/**
 * Settings popup launched from the sidebar. Shows the role-filtered catalog
 * inline so the user doesn't need to leave their current page. Each tile is
 * wrapped in `DialogClose` so clicking navigates AND auto-closes the dialog
 * in one go.
 *
 * Design intent: this is a *menu*, not a landing page — keep the chrome
 * minimal so the tiles are the visual focus. The deep-link page at
 * `/settings` still has the full hero treatment for direct visits.
 */
export function SettingsDialog({ roles, trigger }: SettingsDialogProps) {
  const t = useTranslations();
  const groups = visibleGroups(roles);

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="grid max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        {/* Compact header — icon + title on one row, subtitle below */}
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SettingsIcon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <DialogTitle className="text-base leading-tight">
              {t("settings_hub.dialog_title")}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {t("settings_hub.dialog_subtitle")}
            </DialogDescription>
          </div>
        </div>

        {/* Scrollable groups — list-style headers, tiles in a 2-col grid */}
        <div className="overflow-y-auto px-4 py-4 scrollbar-thin">
          <div className="space-y-5">
            {groups.map((group, idx) => (
              <section key={group.titleKey} className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t(group.titleKey)}
                  </h3>
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                    {t("settings_hub.dialog_count", { count: group.tiles.length })}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.tiles.map((tile) => {
                    const Icon = tile.icon;
                    return (
                      <DialogClose asChild key={tile.href}>
                        <Link
                          href={tile.href}
                          className={cn(
                            "group relative flex items-center gap-3 overflow-hidden rounded-xl border bg-card p-3 transition-all",
                            "hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-soft-lg",
                          )}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-x-0 top-0 h-[2px] bg-primary-gradient opacity-0 transition-opacity group-hover:opacity-100"
                          />
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                              tile.tone,
                            )}
                          >
                            <Icon className="h-[16px] w-[16px]" />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="line-clamp-1 text-sm font-medium text-foreground">
                              {t(tile.titleKey)}
                            </span>
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">
                              {t(tile.descriptionKey)}
                            </span>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                        </Link>
                      </DialogClose>
                    );
                  })}
                </div>

                {/* Subtle divider between groups (except after last) */}
                {idx < groups.length - 1 && (
                  <div aria-hidden className="pt-3" />
                )}
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
