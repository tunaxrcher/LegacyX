"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  CalendarRange,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsUpDown,
  List,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  addDays,
  addMonths,
  fmtDateInput,
  parseAnchor,
  type ViewMode,
} from "./time-utils";

interface DoctorOption {
  id: string;
  fullName: string;
}

interface Props {
  view: ViewMode;
  anchorISO: string; // YYYY-MM-DD
  rangeLabel: string; // pretty label of the current range, e.g. "May 14, 2026"
  /** Comma-separated CSV from URL — multiple statuses can be active at once. */
  status: string;
  /** Comma-separated CSV from URL — multiple doctors can be active at once. */
  doctorId: string;
  q: string;
  doctors: DoctorOption[];
}

const VIEWS: Array<{ id: ViewMode; labelKey: string; icon: React.ReactNode }> = [
  { id: "day", labelKey: "view_day", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { id: "week", labelKey: "view_week", icon: <CalendarRange className="h-3.5 w-3.5" /> },
  { id: "month", labelKey: "view_month", icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { id: "list", labelKey: "view_list", icon: <List className="h-3.5 w-3.5" /> },
];

const STATUSES = [
  "BOOKED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

function parseCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toCsv(arr: string[]): string | undefined {
  return arr.length ? arr.join(",") : undefined;
}

export function AppointmentToolbar({
  view,
  anchorISO,
  rangeLabel,
  status,
  doctorId,
  q,
  doctors,
}: Props) {
  const t = useTranslations("appointments");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = React.useState(q);

  const selectedStatuses = React.useMemo(() => parseCsv(status), [status]);
  const selectedDoctorIds = React.useMemo(() => parseCsv(doctorId), [doctorId]);

  React.useEffect(() => setSearchValue(q), [q]);

  function buildHref(updates: Record<string, string | undefined>): string {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function navigateDate(deltaDays: number) {
    const anchor = parseAnchor(anchorISO);
    let next: Date;
    if (view === "month") {
      next = addMonths(anchor, deltaDays > 0 ? 1 : -1);
    } else if (view === "week") {
      next = addDays(anchor, deltaDays > 0 ? 7 : -7);
    } else {
      next = addDays(anchor, deltaDays);
    }
    router.push(buildHref({ date: fmtDateInput(next) }));
  }

  function goToday() {
    router.push(buildHref({ date: fmtDateInput(new Date()) }));
  }

  function onSubmitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildHref({ q: searchValue.trim() || undefined }));
  }

  function toggleStatus(s: string) {
    const next = selectedStatuses.includes(s)
      ? selectedStatuses.filter((x) => x !== s)
      : [...selectedStatuses, s];
    router.push(buildHref({ status: toCsv(next) }));
  }

  function toggleDoctor(id: string) {
    const next = selectedDoctorIds.includes(id)
      ? selectedDoctorIds.filter((x) => x !== id)
      : [...selectedDoctorIds, id];
    router.push(buildHref({ doctor_id: toCsv(next) }));
  }

  function clearStatus() {
    router.push(buildHref({ status: undefined }));
  }

  function clearDoctor() {
    router.push(buildHref({ doctor_id: undefined }));
  }

  const hasFilters =
    selectedStatuses.length > 0 || selectedDoctorIds.length > 0 || q.length > 0;

  return (
    <div className="space-y-3">
      {/* View switcher + date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          {VIEWS.map((v) => {
            const isActive = view === v.id;
            return (
              <Link
                key={v.id}
                href={buildHref({ view: v.id })}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {v.icon}
                {t(v.labelKey)}
              </Link>
            );
          })}
        </div>

        {view !== "list" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => navigateDate(-1)}
              aria-label={t("prev")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[180px] rounded-md border bg-background px-3 py-1.5 text-center text-xs font-semibold">
              {rangeLabel}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => navigateDate(1)}
              aria-label={t("next")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday}>
              {t("today")}
            </Button>
            <input
              type="date"
              value={anchorISO}
              onChange={(e) =>
                router.push(buildHref({ date: e.target.value || undefined }))
              }
              className="h-8 rounded-md border bg-background px-2 text-xs"
            />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status multi-select */}
        <MultiSelect
          label={t("filter_status")}
          allLabel={t("all_statuses")}
          selectedCount={selectedStatuses.length}
          summary={
            selectedStatuses.length === 0
              ? t("all_statuses")
              : selectedStatuses.length === 1
                ? labelForStatus(selectedStatuses[0]!, t)
                : `${selectedStatuses.length} ${t("selected")}`
          }
          onClear={clearStatus}
          options={STATUSES.map((s) => ({
            value: s,
            label: labelForStatus(s, t),
            checked: selectedStatuses.includes(s),
          }))}
          onToggle={toggleStatus}
        />

        {/* Doctor multi-select */}
        <MultiSelect
          label={t("filter_doctor")}
          allLabel={t("all_doctors")}
          selectedCount={selectedDoctorIds.length}
          summary={
            selectedDoctorIds.length === 0
              ? t("all_doctors")
              : selectedDoctorIds.length === 1
                ? doctors.find((d) => d.id === selectedDoctorIds[0])?.fullName ??
                  t("filter_doctor")
                : `${selectedDoctorIds.length} ${t("selected")}`
          }
          onClear={clearDoctor}
          options={doctors.map((d) => ({
            value: d.id,
            label: d.fullName,
            checked: selectedDoctorIds.includes(d.id),
          }))}
          onToggle={toggleDoctor}
        />

        <form onSubmit={onSubmitSearch} className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={t("search_placeholder")}
              className="h-8 w-56 pl-7 text-xs"
            />
          </div>
        </form>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() =>
              router.push(
                buildHref({
                  status: undefined,
                  doctor_id: undefined,
                  q: undefined,
                }),
              )
            }
          >
            <X className="h-3 w-3" />
            {t("clear_filters")}
          </Button>
        )}
      </div>

      {/* Selected chips row — quick visual confirmation of what's filtered */}
      {(selectedStatuses.length > 0 || selectedDoctorIds.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedStatuses.map((s) => (
            <button
              key={`st-${s}`}
              type="button"
              onClick={() => toggleStatus(s)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2 text-[11px] font-medium text-info hover:bg-info/20"
            >
              {labelForStatus(s, t)}
              <X className="h-3 w-3" />
            </button>
          ))}
          {selectedDoctorIds.map((id) => {
            const d = doctors.find((x) => x.id === id);
            return (
              <button
                key={`dr-${id}`}
                type="button"
                onClick={() => toggleDoctor(id)}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/20"
              >
                {d?.fullName ?? id}
                <X className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function labelForStatus(
  s: string,
  t: ReturnType<typeof useTranslations>,
): string {
  try {
    return t(`status.${s}` as never) as string;
  } catch {
    return s;
  }
}

interface MultiSelectProps {
  label: string;
  allLabel: string;
  summary: string;
  selectedCount: number;
  options: Array<{ value: string; label: string; checked: boolean }>;
  onToggle: (value: string) => void;
  onClear: () => void;
}

function MultiSelect({
  label,
  allLabel,
  summary,
  selectedCount,
  options,
  onToggle,
  onClear,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-[160px] justify-between gap-2 text-xs font-normal"
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="text-muted-foreground">{label}:</span>
            <span className="truncate">{summary}</span>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                {selectedCount}
              </Badge>
            )}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <span className="font-medium">{label}</span>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="text-primary hover:underline"
            >
              {allLabel}
            </button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <ul className="py-1">
            {options.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs italic text-muted-foreground">
                —
              </li>
            ) : (
              options.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => onToggle(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        o.checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {o.checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
