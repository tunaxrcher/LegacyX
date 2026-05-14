"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Activity,
  AlertOctagon,
  Settings,
  Search,
  Hotel,
  Sparkles,
  Bell,
  Banknote,
  ScrollText,
  Box,
  Tags,
  ShieldAlert,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

export function CommandPalette() {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden gap-2 text-muted-foreground sm:inline-flex md:w-72 md:justify-between"
      >
        <span className="inline-flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span className="text-sm">{t("common.search")}</span>
        </span>
        <kbd className="pointer-events-none ml-auto hidden select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] md:inline-flex">
          ⌘K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("common.search")} />
        <CommandList>
          <CommandEmpty>{t("common.no_results")}</CommandEmpty>
          <CommandGroup heading={t("nav.operations")}>
            <CommandItem onSelect={() => go("/")}>
              <LayoutDashboard /> {t("nav.dashboard")}
              <CommandShortcut>G D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/appointments")}>
              <CalendarDays /> {t("nav.appointments")}
              <CommandShortcut>G A</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/patients")}>
              <Users /> {t("nav.patients")}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t("nav.clinical")}>
            <CommandItem onSelect={() => go("/visits")}>
              <Activity /> {t("nav.visits")}
            </CommandItem>
            <CommandItem onSelect={() => go("/resources")}>
              <Hotel /> {t("nav.resources")}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t("nav.manager")}>
            <CommandItem onSelect={() => go("/manager")}>
              <LayoutDashboard /> {t("nav.manager_dashboard")}
            </CommandItem>
            <CommandItem onSelect={() => go("/manager/eod")}>
              <Banknote /> {t("nav.manager_eod")}
            </CommandItem>
            <CommandItem onSelect={() => go("/manager/catalog")}>
              <Box /> {t("nav.manager_catalog")}
            </CommandItem>
            <CommandItem onSelect={() => go("/manager/promotions")}>
              <Tags /> {t("nav.promotions")}
            </CommandItem>
            <CommandItem onSelect={() => go("/manager/resources")}>
              <Hotel /> {t("nav.manager_resources")}
            </CommandItem>
            <CommandItem onSelect={() => go("/manager/services")}>
              <Sparkles /> {t("nav.manager_services")}
            </CommandItem>
            <CommandItem onSelect={() => go("/manager/notifications")}>
              <Bell /> {t("nav.manager_notifications")}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t("nav.admin")}>
            <CommandItem onSelect={() => go("/audit")}>
              <ScrollText /> {t("nav.audit")}
            </CommandItem>
            <CommandItem onSelect={() => go("/break-glass")}>
              <ShieldAlert /> {t("nav.break_glass")}
            </CommandItem>
            <CommandItem onSelect={() => go("/dlq")}>
              <AlertOctagon /> {t("nav.dlq")}
            </CommandItem>
            <CommandItem onSelect={() => go("/settings")}>
              <Settings /> {t("nav.settings")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
