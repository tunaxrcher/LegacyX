"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tween a numeric value from 0 → target on mount (and again whenever
 * `value` changes). Used for wallet balance + count badges so the number
 * "rolls in" instead of slamming on screen.
 *
 * Honours `prefers-reduced-motion` (jumps straight to the target value).
 *
 * Pure rAF — no deps. Default duration 700ms with an ease-out cubic so the
 * animation feels responsive but not jittery.
 */
export function AnimatedNumber({
  value,
  duration = 700,
  format = (n) => n.toLocaleString(),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(t < 1 ? next : value);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // We deliberately exclude `display` so each new `value` tween starts from
    // wherever the previous tween was paused — gives a smooth chain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={className} aria-label={String(value)}>
      {format(Math.round(display))}
    </span>
  );
}
