/**
 * Decorative gradient-mesh background for hero sections.
 *
 * Two soft brand-tinted blobs anchored at the TOP corners only (drifting
 * via the `animate-blob-{1,2}` keyframes). Sits behind content via `-z-10`,
 * pointer-events disabled, aria-hidden — purely atmospheric depth.
 *
 * Earlier revision had a third blob centred in the content area which made
 * users think a random green smudge had appeared. Removed: blobs now hug
 * the top edge and fade out by ~40% page height via the vignette gradient.
 *
 * Parent container must be `relative overflow-hidden` so the blobs don't
 * spill onto neighbouring sections.
 */
export function HeroMesh({ tone = "brand" }: { tone?: "brand" | "warm" }) {
  const palette =
    tone === "warm"
      ? {
          a: "rgba(252, 165, 105, 0.22)",
          b: "rgba(248, 113, 153, 0.18)",
        }
      : {
          a: "hsl(170 74% 65% / 0.22)",
          b: "hsl(184 80% 70% / 0.18)",
        };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[55vh] overflow-hidden"
    >
      <div
        className="animate-blob-1 absolute -top-32 -left-20 h-80 w-80 rounded-full blur-[80px]"
        style={{ background: palette.a }}
      />
      <div
        className="animate-blob-2 absolute -top-20 -right-20 h-96 w-96 rounded-full blur-[80px]"
        style={{ background: palette.b }}
      />
      {/* Vignette: blobs blend into the page background quickly so they read
          as ambient warmth, not as objects on the page. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
    </div>
  );
}
