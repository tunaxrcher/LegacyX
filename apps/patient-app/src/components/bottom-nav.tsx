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
 *   - hasSession=true   → 5 tabs (Home / Visits / Wallet / Profile + login swapped out)
 *   - hasSession=false  → tabs that would 401 are replaced with a "Login" CTA so
 *                          guests don't get bounced to /login mid-stride.
 *
 * The "Book" tab from the old design is gone — booking now starts at the Home
 * tab (`/` → categories → service → register → book).
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-md pb-safe-bottom">
      <ul
        className={cn(
          "mx-auto max-w-md grid",
          hasSession ? "grid-cols-4" : "grid-cols-2",
        )}
      >
        {items.map((it) => {
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const Icon = it.icon;
          // Guard against rendering protected tabs without session — fall back
          // to /login link if we somehow get into that state.
          const safeHref = !hasSession && PROTECTED_HREFS.has(it.href) ? "/login" : it.href;
          return (
            <li key={it.key} className="flex">
              <Link
                href={safeHref}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
                <span>{t(it.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
