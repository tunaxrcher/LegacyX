"use client";

import { useEffect, useState } from "react";

/**
 * Animated success checkmark — circle draws first, then the tick stroke.
 *
 * Two paths share the `stroke-dasharray=100 stroke-dashoffset=100` trick: the
 * `animate-check-circle` / `animate-check-tick` keyframes (in globals.css)
 * tween dashoffset to 0, which "draws" each path. The `Confetti` companion
 * fires at the same time for the celebration moment.
 */
export function SuccessCheck({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-success"
      aria-hidden="true"
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="180"
        strokeDashoffset="180"
        style={{ animation: "check-draw 0.45s ease-out forwards" }}
      />
      <path
        d="M20 33 L29 42 L45 24"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="40"
        strokeDashoffset="40"
        style={{ animation: "check-draw 0.35s ease-out 0.4s forwards" }}
      />
    </svg>
  );
}

const CONFETTI_COLORS = [
  "hsl(170 74% 41%)",
  "hsl(168 72% 47%)",
  "hsl(174 85% 35%)",
  "hsl(38 92% 60%)",
  "hsl(330 70% 60%)",
  "hsl(220 90% 65%)",
];

type Piece = {
  id: number;
  left: number;
  tx: number;
  ty: number;
  rot: number;
  delay: number;
  color: string;
  shape: "rect" | "circle";
};

/**
 * One-shot CSS confetti shower. No external lib — we render N absolutely
 * positioned pieces with randomised end-translates and let CSS animate them
 * down + out via the `confetti-fall` keyframe. Pieces unmount themselves
 * after the animation completes so we don't leak DOM nodes.
 */
export function Confetti({ count = 32 }: { count?: number }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    // Respect reduced-motion users — skip the celebration entirely.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const list: Piece[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      tx: (Math.random() - 0.5) * 240,
      ty: 60 + Math.random() * 40,
      rot: (Math.random() - 0.5) * 720,
      delay: Math.random() * 200,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    }));
    setPieces(list);

    const t = window.setTimeout(() => setPieces(null), 2200);
    return () => window.clearTimeout(t);
  }, [count]);

  if (!pieces) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden="true"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute top-[-10vh]"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}ms`,
            // CSS variables consumed by the `confetti-fall` keyframe.
            ["--tx" as string]: `${p.tx}px`,
            ["--ty" as string]: `${p.ty}vh`,
            ["--rot" as string]: `${p.rot}deg`,
          }}
        >
          <span
            className={
              p.shape === "rect"
                ? "block h-2.5 w-1.5 rounded-[1px]"
                : "block h-2 w-2 rounded-full"
            }
            style={{ background: p.color }}
          />
        </span>
      ))}
    </div>
  );
}
