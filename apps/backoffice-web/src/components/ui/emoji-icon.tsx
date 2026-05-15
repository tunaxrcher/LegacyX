"use client";

import * as React from "react";
import { Icon as IconifyIcon } from "@iconify/react";

/**
 * Thin Client Component wrapper around `@iconify/react`'s `<Icon>`.
 *
 * Iconify uses React hooks internally to lazy-load icon SVG data, so it can
 * only run on the client. By keeping this wrapper in a `"use client"` file
 * we let Server Components embed colorful Fluent Emoji icons without
 * forcing the whole page to become a Client Component.
 *
 * Browse icon names at https://icon-sets.iconify.design/ — for the colorful
 * "branded" look in this project we standardize on the
 * `fluent-emoji-flat:*` collection (Microsoft Fluent Emoji, flat 2D variant).
 */
export function EmojiIcon({
  icon,
  size = 24,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  return (
    <IconifyIcon
      icon={icon}
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}
