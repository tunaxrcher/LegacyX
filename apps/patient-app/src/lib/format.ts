/**
 * Cross-app text formatters.
 *
 * Anything that produces a user-visible string from a domain value lives
 * here so we don't grow yet another copy of "format a price range" inside
 * each page. Formatters MUST be locale-aware (`th` | `en`) and MUST be pure
 * (no I/O, no hooks).
 */

type PriceShape = {
  price_from: number | null;
  price_to: number | null;
};

/**
 * Service price → display label.
 *
 * Behaviour matrix (matches the original implementations in
 * `/c/[code]/page.tsx` and `/booking/[id]/success/page.tsx`):
 *   - both null            → "สอบถามราคา" / "Ask for price"
 *   - from = 0, to = null  → "เริ่มต้น 0.-" / "Starting 0.-"
 *   - distinct from + to   → "X - Y.-"
 *   - everything else      → "X.-"
 */
export function formatPriceLabel(s: PriceShape, locale: string): string {
  if (s.price_from == null && s.price_to == null) {
    return locale === "th" ? "สอบถามราคา" : "Ask for price";
  }
  if (s.price_from === 0 && s.price_to == null) {
    return locale === "th" ? "เริ่มต้น 0.-" : "Starting 0.-";
  }
  if (
    s.price_from != null &&
    s.price_to != null &&
    s.price_from !== s.price_to
  ) {
    return `${s.price_from.toLocaleString()} - ${s.price_to.toLocaleString()}.-`;
  }
  return `${(s.price_from ?? s.price_to ?? 0).toLocaleString()}.-`;
}
