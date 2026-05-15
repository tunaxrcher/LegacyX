import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

export interface ListSurfaceProps {
  /** Pagination state (the server has already counted). */
  total: number;
  page: number;
  perPage: number;
  /** Build the href for a given page number. */
  getPageHref: (page: number) => string;
  /** Build the href when changing page size (should reset page to 1). */
  getPerPageHref?: (perPage: number) => string;
  /** Empty-state copy when `total === 0`. */
  empty: {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
  };
  /**
   * The list body — typically a `<Table>` or a grid `<ul>` of cards. Wrap
   * Table/Grid switching in the caller; this surface only handles the
   * empty state and pagination footer.
   */
  children: React.ReactNode;
  /** Extra class on the outer `<Card>` — e.g. to disable rounded corners. */
  className?: string;
}

/**
 * `<ListSurface>` — the shared Card shell every backoffice list page uses.
 * Owns the empty state (when `total === 0`) and the pagination footer so
 * the caller never has to repeat them.
 *
 *   <ListSurface
 *     total={total} page={page} perPage={perPage}
 *     getPageHref={...} getPerPageHref={...}
 *     empty={{ icon, title, description }}
 *   >
 *     {view === "grid" ? <Grid/> : <Table/>}
 *   </ListSurface>
 *
 * Skipping the empty branch when you need a more elaborate empty layout
 * (e.g. PDPA's history-with-cards screen) is OK — just keep `total > 0`
 * branch in the caller.
 */
export function ListSurface({
  total,
  page,
  perPage,
  getPageHref,
  getPerPageHref,
  empty,
  children,
  className,
}: ListSurfaceProps) {
  return (
    <Card className={"overflow-hidden " + (className ?? "")}>
      <CardContent className="p-0">
        {total === 0 ? (
          <EmptyState
            className="m-6"
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={empty.action}
          />
        ) : (
          children
        )}
        {total > 0 && (
          <Pagination
            total={total}
            page={page}
            perPage={perPage}
            getPageHref={getPageHref}
            getPerPageHref={getPerPageHref}
          />
        )}
      </CardContent>
    </Card>
  );
}
