"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus, Home, ScrollText, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", key: "home", icon: Home },
  { href: "/book", key: "book", icon: CalendarPlus },
  { href: "/visits", key: "visits", icon: ScrollText },
  { href: "/wallet", key: "wallet", icon: Wallet },
  { href: "/profile", key: "profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("tab");
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-md pb-safe-bottom">
      <ul className="mx-auto max-w-md grid grid-cols-5">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <li key={it.key} className="flex">
              <Link
                href={it.href}
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
