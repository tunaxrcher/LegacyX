"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

type RippleSpec = { id: number; x: number; y: number; size: number };

/**
 * Drop-in overlay for a `relative overflow-hidden` parent (e.g. a card link)
 * that adds material-style click ripples without changing layout.
 *
 * Sits absolute inset-0 with z-30 — clicks land on this surface, spawn the
 * ripple visual, and bubble naturally to the parent (Link → navigation,
 * Button → onClick, etc.). We deliberately do NOT call preventDefault.
 */
export function RippleSurface({
  color = "rgba(255,255,255,0.5)",
  className,
}: {
  color?: string;
  className?: string;
}) {
  const [ripples, setRipples] = useState<RippleSpec[]>([]);
  const idRef = useRef(0);

  const spawn = useCallback((e: MouseEvent<HTMLSpanElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = ++idRef.current;
    setRipples((r) => [...r, { id, x, y, size }]);
    window.setTimeout(() => {
      setRipples((r) => r.filter((rp) => rp.id !== id));
    }, 600);
  }, []);

  return (
    <span
      onPointerDown={spawn}
      aria-hidden="true"
      className={cn("absolute inset-0 z-30 overflow-hidden", className)}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full animate-ripple"
          style={{
            top: r.y,
            left: r.x,
            width: r.size,
            height: r.size,
            background: color,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Wrap any tappable surface to give it a Material-style click ripple.
 *
 * Renders a span span at the click coordinates, sized to fully cover the
 * element diagonally, then animates scale + opacity via the `animate-ripple`
 * keyframe. Multiple ripples can stack (e.g. fast double-taps); each
 * removes itself ~600ms after spawn.
 *
 * Works on `<Link>` (since it's just a wrapper div) without breaking
 * navigation — we don't preventDefault.
 */
export function Ripple({
  children,
  className,
  color = "rgba(255,255,255,0.45)",
  asChild = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Override the ripple ink colour. Defaults to soft white (good on dark
   *  / coloured backgrounds). Use `rgba(0,0,0,0.08)` on light surfaces. */
  color?: string;
  /** When true, just renders the inner content with the ripple overlay
   *  instead of an extra div wrapper. The parent must already be
   *  `relative overflow-hidden`. */
  asChild?: boolean;
}) {
  const [ripples, setRipples] = useState<RippleSpec[]>([]);
  const idRef = useRef(0);

  const onClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = ++idRef.current;
    setRipples((r) => [...r, { id, x, y, size }]);
    window.setTimeout(() => {
      setRipples((r) => r.filter((rp) => rp.id !== id));
    }, 600);
  }, []);

  const overlay = (
    <>
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full animate-ripple"
          style={{
            top: r.y,
            left: r.x,
            width: r.size,
            height: r.size,
            background: color,
          }}
        />
      ))}
    </>
  );

  if (asChild) {
    return (
      <div
        className="contents"
        onClickCapture={onClick}
      >
        {children}
        {overlay}
      </div>
    );
  }

  return (
    <div
      onClickCapture={onClick}
      className={cn("relative overflow-hidden", className)}
    >
      {children}
      {overlay}
    </div>
  );
}
