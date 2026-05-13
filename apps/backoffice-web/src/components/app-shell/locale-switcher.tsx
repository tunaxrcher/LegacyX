"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeLabels, locales } from "@/i18n/config";
import { setLocaleAction } from "@/app/actions";

export function LocaleSwitcher() {
  const current = useLocale();
  const [pending, start] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1" disabled={pending}>
          <Languages className="h-4 w-4" />
          <span className="hidden text-xs sm:inline">
            {localeLabels[current as keyof typeof localeLabels] ?? current}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => start(() => setLocaleAction(l))}
            className={l === current ? "bg-accent" : ""}
          >
            {localeLabels[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
