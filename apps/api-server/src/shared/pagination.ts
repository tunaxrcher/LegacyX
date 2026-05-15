/**
 * Standard pagination parsing for list endpoints.
 *
 * All list endpoints should accept `page` (1-indexed) and `per_page` (size)
 * and return `pagination: { total, page, perPage }` alongside `data`. The
 * legacy `limit` parameter is honoured as a fallback for callers that
 * haven't migrated yet.
 *
 * @example
 *   const { page, perPage, skip, take } = parsePagination(req, { defaultPerPage: 25 });
 *   const [total, rows] = await Promise.all([
 *     prisma.foo.count({ where }),
 *     prisma.foo.findMany({ where, skip, take, orderBy: {...} }),
 *   ]);
 *   return NextResponse.json({ data: rows, pagination: { total, page, perPage } });
 */
export interface PaginationOptions {
  /** Default page size if the caller omits `per_page` / `limit`. */
  defaultPerPage?: number;
  /** Hard upper bound for `per_page`. */
  maxPerPage?: number;
}

export interface PaginationResult {
  /** 1-indexed page number, ≥ 1. */
  page: number;
  /** Items per page, ≥ 1 and ≤ `maxPerPage`. */
  perPage: number;
  /** Convenience: `(page-1) * perPage` — pass to Prisma `skip:`. */
  skip: number;
  /** Convenience: same as `perPage` — pass to Prisma `take:`. */
  take: number;
}

const DEFAULT_PER_PAGE = 25;
const DEFAULT_MAX_PER_PAGE = 100;

export function parsePagination(
  reqOrUrl: Request | URL | string,
  opts: PaginationOptions = {},
): PaginationResult {
  const url =
    reqOrUrl instanceof URL
      ? reqOrUrl
      : typeof reqOrUrl === "string"
        ? new URL(reqOrUrl)
        : new URL(reqOrUrl.url);

  const defaultPerPage = opts.defaultPerPage ?? DEFAULT_PER_PAGE;
  const maxPerPage = opts.maxPerPage ?? DEFAULT_MAX_PER_PAGE;

  const pageRaw = Number(url.searchParams.get("page") ?? 1);
  const perPageRaw = Number(
    url.searchParams.get("per_page") ??
      url.searchParams.get("limit") ??
      defaultPerPage,
  );
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const perPage = Math.min(
    maxPerPage,
    Math.max(1, Number.isFinite(perPageRaw) ? Math.floor(perPageRaw) : defaultPerPage),
  );
  return {
    page,
    perPage,
    skip: (page - 1) * perPage,
    take: perPage,
  };
}
