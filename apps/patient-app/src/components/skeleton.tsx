import { cn } from "@/lib/utils";

/**
 * Shimmer skeleton block. Used for loading.tsx files + inline placeholders.
 *
 * The shimmer keyframe + `.shimmer-overlay` class are defined in globals.css
 * — they honour `prefers-reduced-motion` and degrade to a static muted block.
 */
export function Skeleton({
  className,
  rounded = "rounded-xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted/70",
        rounded,
        className,
      )}
      aria-hidden="true"
    >
      <div className="shimmer-overlay" />
    </div>
  );
}

/** Card-shaped skeleton for visit / appointment cards. */
export function SkeletonCard({ height = "h-28" }: { height?: string }) {
  return <Skeleton className={cn("w-full", height)} rounded="rounded-3xl" />;
}

/** Vertical list of N skeleton cards with stagger fade-in. */
export function SkeletonList({
  count = 3,
  height = "h-28",
}: {
  count?: number;
  height?: string;
}) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="animate-slide-up"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <SkeletonCard height={height} />
        </li>
      ))}
    </ul>
  );
}
