"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PerPageOption {
  value: number;
  href: string;
}

interface PerPageSelectProps {
  value: number;
  /**
   * Pre-computed list of options + hrefs. We accept hrefs (plain strings)
   * rather than a `(n) => string` factory because <Pagination> is a Server
   * Component and functions cannot cross the server→client boundary.
   */
  options: PerPageOption[];
  label: string;
}

/**
 * Tiny client island used inside the (server) <Pagination> component to let
 * the user change "per page" without losing the rest of the query string.
 */
export function PerPageSelect({ value, options, label }: PerPageSelectProps) {
  const router = useRouter();
  // Map value → href for O(1) lookup on change.
  const hrefByValue = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(String(o.value), o.href);
    return m;
  }, [options]);
  return (
    <label className="flex items-center gap-2">
      <span className="hidden sm:inline">{label}</span>
      <Select
        value={String(value)}
        onValueChange={(v) => {
          const href = hrefByValue.get(v);
          if (href) router.replace(href);
        }}
      >
        <SelectTrigger className="h-8 w-[80px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={String(opt.value)}>
              {opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
