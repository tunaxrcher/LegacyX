/**
 * Helpers for backoffice list pages — keeps URL/query-string handling
 * uniform across /patients, /admin/users, /audit, etc.
 *
 * The pattern every list page follows:
 *   - URL params: `q`, `view`, `page`, `per_page`, plus whatever filters
 *     the page exposes (e.g. `status`, `gender`, `channel`, …).
 *   - The server reads them via `parseListSearchParams`, fetches data,
 *     then renders a `<ListToolbar>` + `<Pagination>`.
 */

export type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | undefined;

export interface ParsedListParams {
  q: string;
  view: "table" | "grid";
  page: number;
  perPage: number;
}

/**
 * Pull a single string value from Next 14's `searchParams`. Returns `""` if
 * absent or an array (duplicate keys) — callers can decide what to default.
 */
export function pickString(params: RawSearchParams, key: string): string {
  const v = params?.[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return "";
}

export interface ParseListOptions {
  defaultPerPage?: number;
  maxPerPage?: number;
  defaultView?: "table" | "grid";
}

export function parseListSearchParams(
  searchParams: RawSearchParams,
  opts: ParseListOptions = {},
): ParsedListParams {
  const defaultPerPage = opts.defaultPerPage ?? 25;
  const maxPerPage = opts.maxPerPage ?? 100;
  const defaultView = opts.defaultView ?? "table";

  const pick = (key: string) => pickString(searchParams, key);

  const q = pick("q").trim();
  const viewRaw = pick("view").toLowerCase();
  const view: "table" | "grid" =
    viewRaw === "grid"
      ? "grid"
      : viewRaw === "table"
        ? "table"
        : defaultView;

  const pageRaw = Number(pick("page") || 1);
  const perPageRaw = Number(pick("per_page") || defaultPerPage);
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const perPage = Math.min(
    maxPerPage,
    Math.max(
      1,
      Number.isFinite(perPageRaw) ? Math.floor(perPageRaw) : defaultPerPage,
    ),
  );

  return { q, view, page, perPage };
}

/**
 * Build a URL with merged search params. Use on the server to produce
 * `getPageHref` / `getPerPageHref` factories for `<Pagination>`.
 *
 *   const buildHref = makeListHrefBuilder("/admin/users", {
 *     q, status, role, view, page, per_page: perPage,
 *   });
 *   <Pagination getPageHref={(p) => buildHref({ page: p })} ... />
 */
export function makeListHrefBuilder(
  basePath: string,
  base: Record<string, string | number | undefined | null>,
) {
  return (overrides: Record<string, string | number | undefined | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined | null> = {
      ...base,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === null || v === "") continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
}
