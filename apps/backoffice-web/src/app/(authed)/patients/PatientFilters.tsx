"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PatientViewMode = "table" | "grid";

const ANY = "__any";

const GENDER_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "MALE", labelKey: "gender_male" },
  { value: "FEMALE", labelKey: "gender_female" },
  { value: "OTHER", labelKey: "gender_other" },
  { value: "UNDISCLOSED", labelKey: "gender_undisclosed" },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "ACTIVE", labelKey: "status_active" },
  { value: "INACTIVE", labelKey: "status_inactive" },
  { value: "MERGED", labelKey: "status_merged" },
];

interface PatientFiltersProps {
  q: string;
  gender: string;
  status: string;
  view: PatientViewMode;
  perPage: number;
  basePath?: string;
}

export function PatientFilters({
  q,
  gender,
  status,
  view,
  perPage,
  basePath = "/patients",
}: PatientFiltersProps) {
  const router = useRouter();
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");

  const [search, setSearch] = React.useState(q);
  React.useEffect(() => setSearch(q), [q]);

  const buildHref = React.useCallback(
    (overrides: Record<string, string | number | null>) => {
      const params = new URLSearchParams();
      const next: Record<string, string | number | undefined> = {
        q,
        gender: gender || undefined,
        status: status || undefined,
        view: view === "grid" ? "grid" : undefined,
        per_page: perPage,
        ...overrides,
      };
      // Resetting any of (q | gender | status | per_page) should send us back
      // to page 1 — but page is *never* part of the toolbar state, so we just
      // drop it here.
      delete next.page;
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === null || value === "") continue;
        params.set(key, String(value));
      }
      const qs = params.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [q, gender, status, view, perPage, basePath],
  );

  // Debounced search → navigate
  React.useEffect(() => {
    if (search === q) return;
    const handle = setTimeout(() => {
      router.replace(buildHref({ q: search }));
    }, 300);
    return () => clearTimeout(handle);
  }, [search, q, router, buildHref]);

  const hasAnyFilter = Boolean(q || gender || status);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-soft sm:flex-row sm:items-center sm:flex-wrap">
      {/* Search */}
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label={tCommon("clear")}
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Gender filter */}
        <Select
          value={gender || ANY}
          onValueChange={(v) =>
            router.replace(buildHref({ gender: v === ANY ? null : v }))
          }
        >
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder={t("filter_gender")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filter_all_genders")}</SelectItem>
            {GENDER_OPTIONS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {t(g.labelKey as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={status || ANY}
          onValueChange={(v) =>
            router.replace(buildHref({ status: v === ANY ? null : v }))
          }
        >
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder={t("filter_status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filter_all_statuses")}</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {t(s.labelKey as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Reset filters */}
        {hasAnyFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              router.replace(
                buildHref({ q: null, gender: null, status: null }),
              );
            }}
            className="h-9 gap-1 text-xs"
          >
            <X className="h-3.5 w-3.5" /> {tCommon("reset")}
          </Button>
        )}

        {/* View toggle (Table / Grid) */}
        <div
          role="tablist"
          aria-label="View mode"
          className="ml-auto inline-flex overflow-hidden rounded-lg border bg-background shadow-soft"
        >
          <ViewToggleButton
            href={buildHref({ view: null })}
            active={view !== "grid"}
            label={tCommon("view_table")}
            icon={<List className="h-4 w-4" />}
            onNavigate={router.replace}
          />
          <ViewToggleButton
            href={buildHref({ view: "grid" })}
            active={view === "grid"}
            label={tCommon("view_grid")}
            icon={<LayoutGrid className="h-4 w-4" />}
            onNavigate={router.replace}
          />
        </div>
      </div>
    </div>
  );
}

function ViewToggleButton({
  href,
  active,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onNavigate(href)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
