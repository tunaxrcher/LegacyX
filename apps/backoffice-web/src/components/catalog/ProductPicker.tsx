"use client";

/**
 * Searchable picker over a fixed `products[]` list. Use when you already have
 * the products loaded (e.g. inventory page) and don't want to hit the server
 * catalog API. For visit-level order creation use `CatalogPicker` instead.
 */
import * as React from "react";
import { ChevronsUpDown, Check, Package } from "lucide-react";
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

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
}

export function ProductPicker({
  products,
  value,
  onChange,
  placeholder,
  className,
}: {
  products: ProductOption[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = products.find((p) => p.id === value);

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
          <span className="flex min-w-0 items-center gap-2">
            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-left">
              {selected ? (
                <>
                  <span className="font-mono text-xs">{selected.sku}</span>
                  <span className="ml-2 text-muted-foreground">— {selected.name}</span>
                </>
              ) : (
                placeholder ?? "Pick a product…"
              )}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search SKU or name…" />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.sku} ${p.name}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs">{p.sku}</span>
                  <span className="ml-2">— {p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
