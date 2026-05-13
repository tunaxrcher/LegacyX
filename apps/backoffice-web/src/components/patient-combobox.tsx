"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { clientApi } from "@/lib/clientApi";

export interface PatientOption {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
}

interface Props {
  value: PatientOption | null;
  onChange: (p: PatientOption | null) => void;
}

export function PatientCombobox({ value, onChange }: Props) {
  const t = useTranslations("appointments");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<PatientOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    const path = `/api/v1/patients?q=${encodeURIComponent(query)}&limit=20`;
    clientApi
      .get<{ data: PatientOption[] }>(path, { signal: ctrl.signal })
      .then((r) => setResults(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            !value && "text-muted-foreground"
          )}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <User className="h-4 w-4" />
            {value
              ? `${value.hn} · ${value.firstName} ${value.lastName}`
              : t("no_patient_selected")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("patient_search_placeholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Searching…
              </div>
            ) : (
              <>
                <CommandEmpty>No patients found</CommandEmpty>
                <CommandGroup>
                  {results.map((p) => {
                    const active = value?.id === p.id;
                    return (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          onChange(p);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4",
                            active ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">HN {p.hn}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
