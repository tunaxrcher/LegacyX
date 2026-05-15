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

export interface ListToolbarSelectOption {
  value: string;
  /** Already-translated display text. */
  label: string;
}

export interface ListToolbarSelect {
  /** URL param key (e.g. "status"). */
  key: string;
  /** Already-translated select label / placeholder. */
  label: string;
  options: ListToolbarSelectOption[];
  /** Width override (Tailwind class), e.g. "w-[140px]". */
  widthClass?: string;
}

export type ListToolbarView = "table" | "grid";

export interface ListToolbarProps {
  /** Path to navigate to (e.g. "/admin/users"). */
  basePath: string;
  /** Current state, mirrored from the URL on the server. */
  q: string;
  filters: Record<string, string>;
  view?: ListToolbarView;
  perPage: number;
  /** Filter selects (controlled by URL params). */
  selects?: ListToolbarSelect[];
  /** Show search input. */
  searchKey?: string; // e.g. "q"
  searchPlaceholder?: string;
  /** Show table/grid view toggle. Defaults to false. */
  showViewToggle?: boolean;
  /** Extra params to always preserve (e.g. KPI tab id). */
  preserveParams?: Record<string, string | undefined>;
}

const ANY = "__any";

/**
 * `ListToolbar` — standard filter + search + view-toggle bar for backoffice
 * list pages. Server pages render this once; selects update the URL via
 * `next/navigation` and the page re-fetches with new params.
 *
 * Any filter / search change always resets `page` to 1.
 */
export function ListToolbar({
  basePath,
  q,
  filters,
  view = "table",
  perPage,
  selects = [],
  searchKey = "q",
  searchPlaceholder,
  showViewToggle = false,
  preserveParams,
}: ListToolbarProps) {
  const router = useRouter();
  const tCommon = useTranslations("common");

  const [search, setSearch] = React.useState(q);
  React.useEffect(() => setSearch(q), [q]);

  const buildHref = React.useCallback(
    (overrides: Record<string, string | number | null>) => {
      const params = new URLSearchParams();
      const merged: Record<string, string | number | undefined> = {
        ...preserveParams,
        [searchKey]: q || undefined,
        ...filters,
        view: view === "grid" ? "grid" : undefined,
        per_page: perPage,
        ...overrides,
      };
      delete merged.page;
      for (const [k, v] of Object.entries(merged)) {
        if (v === undefined || v === null || v === "") continue;
        params.set(k, String(v));
      }
      const qs = params.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [basePath, q, filters, view, perPage, searchKey, preserveParams],
  );

  // Debounced search → navigate
  React.useEffect(() => {
    if (search === q) return;
    const handle = setTimeout(() => {
      router.replace(buildHref({ [searchKey]: search }));
    }, 300);
    return () => clearTimeout(handle);
  }, [search, q, router, buildHref, searchKey]);

  const hasAnyFilter =
    Boolean(q) || Object.values(filters).some((v) => Boolean(v));

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-soft sm:flex-row sm:items-center sm:flex-wrap">
      {/* Search */}
      {searchKey && (
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? tCommon("search")}
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
      )}

      <div className="flex flex-wrap items-center gap-2">
        {selects.map((sel) => {
          const current = filters[sel.key] || ANY;
          return (
            <Select
              key={sel.key}
              value={current}
              onValueChange={(v) =>
                router.replace(
                  buildHref({ [sel.key]: v === ANY ? null : v }),
                )
              }
            >
              <SelectTrigger
                className={cn("h-9 text-xs", sel.widthClass ?? "w-[150px]")}
              >
                <SelectValue placeholder={sel.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{sel.label}</SelectItem>
                {sel.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {hasAnyFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              const clearedFilters = Object.fromEntries(
                Object.keys(filters).map((k) => [k, null] as const),
              );
              router.replace(
                buildHref({ [searchKey]: null, ...clearedFilters }),
              );
            }}
            className="h-9 gap-1 text-xs"
          >
            <X className="h-3.5 w-3.5" /> {tCommon("reset")}
          </Button>
        )}

        {showViewToggle && (
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
        )}
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
