"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, LogIn, ScrollText, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const PROTECTED_HREFS = new Set(["/visits", "/wallet", "/profile"]);

/**
 * Mobile bottom navigation.
 *
 * Two modes:
 *   - hasSession=true   → 4 tabs (Home / Visits / Wallet / Profile)
 *   - hasSession=false  → tabs that would 401 are replaced with a "Login" CTA
 *
 * The active "pill" is a single absolutely-positioned div behind all tabs
 * that translates X based on the active index. Browsers tween the
 * `transform` cheaply on the GPU so we get a buttery glide for free without
 * pulling in framer-motion.
 */
export function BottomNav({ hasSession }: { hasSession: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("tab");

  const items = hasSession
    ? ([
        { href: "/", key: "home", icon: Home },
        { href: "/visits", key: "visits", icon: ScrollText },
        { href: "/wallet", key: "wallet", icon: Wallet },
        { href: "/profile", key: "profile", icon: User },
      ] as const)
    : ([
        { href: "/", key: "home", icon: Home },
        { href: "/login", key: "login", icon: LogIn },
      ] as const);

  // Highlight rule: active tab gets primary colour + a tiny accent dot under
  // the label. Earlier revision had a sliding "pill" pad behind the active
  // tab — removed because it competed with the icon's colour change for
  // attention.
  const activeIdx = (() => {
    const idx = items.findIndex((it) =>
      it.href === "/" ? pathname === "/" : pathname.startsWith(it.href),
    );
    return idx === -1 ? 0 : idx;
  })();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-md pb-safe-bottom">
      <ul
        className={cn(
          "mx-auto max-w-md grid",
          hasSession ? "grid-cols-4" : "grid-cols-2",
        )}
      >
        {items.map((it, i) => {
          const active = i === activeIdx;
          const Icon = it.icon;
          // Guard against rendering protected tabs without session.
          const safeHref =
            !hasSession && PROTECTED_HREFS.has(it.href) ? "/login" : it.href;
          return (
            <li key={it.key} className="flex">
              <Link
                href={safeHref}
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:scale-95",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform duration-300",
                    active && "stroke-[2.4]",
                  )}
                />
                <span>{t(it.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
