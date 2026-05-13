"use client";

/**
 * Searchable picker over the order catalog (procedures, products, medications,
 * courses). Wraps shadcn Popover + cmdk Command. Replaces the awful "type the
 * raw refId" input on the New Order dialog.
 */
import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { clientApi } from "@/lib/clientApi";

export type CatalogItem = {
  refId: string;
  code: string;
  name: string;
  defaultPrice: number;
  itemType: "PROCEDURE" | "PRODUCT" | "MEDICATION" | "COURSE";
  unit?: string | null;
};

interface CatalogPickerProps {
  type?: "PROCEDURE" | "PRODUCT" | "MEDICATION" | "COURSE";
  value?: string;
  onSelect: (item: CatalogItem) => void;
  placeholder?: string;
  className?: string;
}

export function CatalogPicker({
  type,
  value,
  onSelect,
  placeholder,
  className,
}: CatalogPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [picked, setPicked] = React.useState<CatalogItem | null>(null);

  // Load catalog when popover opens or query/type changes
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (query) params.set("q", query);
        const res = await clientApi.get<{ data: CatalogItem[] }>(
          `/api/v1/catalog?${params.toString()}`,
        );
        if (!cancelled) setItems(res.data);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, type]);

  const display =
    picked && picked.refId === value
      ? `${picked.code} — ${picked.name}`
      : value || placeholder || "Pick item…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate text-left">{display}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder ?? "Search catalog…"}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            )}
            {!loading && items.length === 0 && (
              <CommandEmpty>No matches</CommandEmpty>
            )}
            {!loading && items.length > 0 && (
              <CommandGroup>
                {items.map((it) => (
                  <CommandItem
                    key={it.refId}
                    value={it.refId}
                    onSelect={() => {
                      setPicked(it);
                      onSelect(it);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === it.refId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ฿ {it.defaultPrice.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{it.code}</span>
                        <span className="rounded border px-1">{it.itemType}</span>
                        {it.unit && <span>· {it.unit}</span>}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
