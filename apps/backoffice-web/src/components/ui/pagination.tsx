import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PerPageSelect } from "./pagination-per-page-select";

export const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export interface PaginationProps {
  /** Total number of items across all pages. */
  total: number;
  /** Current 1-indexed page. */
  page: number;
  /** Items per page currently in use. */
  perPage: number;
  /** Optional override for choice of per-page sizes. */
  perPageOptions?: readonly number[];
  /** Build the href for a given page number. */
  getPageHref: (page: number) => string;
  /** Build the href for changing the per-page size. Should reset to page 1. */
  getPerPageHref?: (perPage: number) => string;
  /** Visual size variant. */
  size?: "default" | "sm";
  className?: string;
  /** Hide the "Showing X – Y of Z" label on the left. */
  hideSummary?: boolean;
  /** Hide the per-page selector. */
  hidePerPage?: boolean;
}

/**
 * `Pagination` — standard pagination control for backoffice list pages.
 *
 * Server-rendered: every page button is a real `<Link>` so the page can be
 * shared/bookmarked. The per-page selector is a tiny client component.
 *
 * Use the same component on every list page (patients, appointments, visits,
 * staff, inventory, …) so pagination UX stays consistent.
 */
export async function Pagination(props: PaginationProps) {
  const t = await getTranslations("common.pagination");
  return <PaginationInner t={t} {...props} />;
}

/**
 * Client-side variant that picks up translations via `useTranslations`. Use
 * when the page (or filter bar) is already a client component.
 */
export function PaginationClient(props: PaginationProps) {
  const t = useTranslations("common.pagination");
  return <PaginationInner t={t} {...props} />;
}

function PaginationInner({
  t,
  total,
  page,
  perPage,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  getPageHref,
  getPerPageHref,
  size = "default",
  className,
  hideSummary,
  hidePerPage,
}: PaginationProps & {
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const current = Math.min(Math.max(1, page), totalPages);
  const fromItem = total === 0 ? 0 : (current - 1) * perPage + 1;
  const toItem = Math.min(total, current * perPage);
  const pages = buildPageList(current, totalPages);

  const isSm = size === "sm";
  const btnBase = cn(
    "inline-flex items-center justify-center rounded-md border bg-background text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-4",
    isSm ? "h-7 min-w-[1.75rem] px-1.5 text-xs" : "h-8 min-w-[2rem] px-2",
  );
  const activeBtn =
    "bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        {!hideSummary && (
          <span className="tabular-nums">
            {total === 0
              ? t("empty")
              : t("showing", { from: fromItem, to: toItem, total })}
          </span>
        )}
        {!hidePerPage && getPerPageHref && (
          <PerPageSelect
            value={perPage}
            options={perPageOptions.map((opt) => ({
              value: opt,
              href: getPerPageHref(opt),
            }))}
            label={t("per_page")}
          />
        )}
      </div>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <PageLink
          href={getPageHref(1)}
          disabled={current <= 1}
          ariaLabel={t("first")}
          className={btnBase}
        >
          <ChevronsLeft />
        </PageLink>
        <PageLink
          href={getPageHref(current - 1)}
          disabled={current <= 1}
          ariaLabel={t("prev")}
          className={btnBase}
        >
          <ChevronLeft />
        </PageLink>

        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className={cn(
                btnBase,
                "border-transparent bg-transparent hover:bg-transparent",
              )}
            >
              …
            </span>
          ) : (
            <PageLink
              key={p}
              href={getPageHref(p)}
              ariaLabel={t("go_to_page", { page: p })}
              ariaCurrent={p === current ? "page" : undefined}
              className={cn(btnBase, p === current && activeBtn, "tabular-nums")}
            >
              {p}
            </PageLink>
          ),
        )}

        <PageLink
          href={getPageHref(current + 1)}
          disabled={current >= totalPages}
          ariaLabel={t("next")}
          className={btnBase}
        >
          <ChevronRight />
        </PageLink>
        <PageLink
          href={getPageHref(totalPages)}
          disabled={current >= totalPages}
          ariaLabel={t("last")}
          className={btnBase}
        >
          <ChevronsRight />
        </PageLink>
      </nav>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  ariaLabel,
  ariaCurrent,
  className,
  children,
}: {
  href: string;
  disabled?: boolean;
  ariaLabel: string;
  ariaCurrent?: "page";
  className?: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span aria-disabled className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={className}
    >
      {children}
    </Link>
  );
}

/**
 * Builds a compact page list with ellipses. Always shows first + last, the
 * current page and one neighbour on each side. Typical output:
 *   [1, "…", 4, 5, 6, 7, 8, "…", 20]
 *   [1, 2, 3, 4, 5]            // small total
 *   [1, "…", 18, 19, 20]       // near the end
 */
function buildPageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p += 1) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}
