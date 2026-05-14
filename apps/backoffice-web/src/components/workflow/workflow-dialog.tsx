"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Sparkles,
  ClipboardList,
  Stethoscope,
  Wallet,
  Activity,
  RotateCcw,
  Banknote,
  Repeat,
  ShieldCheck,
  ArrowRight,
  Info,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  WORKFLOW,
  PLATFORM_NOTES,
  type Phase,
  type Step,
  type WorkflowRole,
} from "./content";

const ICON_MAP = {
  Sparkles,
  ClipboardList,
  Stethoscope,
  Wallet,
  Activity,
  RotateCcw,
  Banknote,
  Repeat,
  ShieldCheck,
} as const;

// Phase header gradient + step rail. Plain Tailwind classes so JIT picks
// them up without a safelist.
const TONE_STYLE: Record<Phase["tone"], { ring: string; pill: string }> = {
  teal: { ring: "ring-teal-200/70 bg-teal-50", pill: "bg-teal-500/10 text-teal-700" },
  amber: { ring: "ring-amber-200/70 bg-amber-50", pill: "bg-amber-500/15 text-amber-700" },
  violet: { ring: "ring-violet-200/70 bg-violet-50", pill: "bg-violet-500/10 text-violet-700" },
  sky: { ring: "ring-sky-200/70 bg-sky-50", pill: "bg-sky-500/10 text-sky-700" },
  rose: { ring: "ring-rose-200/70 bg-rose-50", pill: "bg-rose-500/10 text-rose-700" },
  slate: { ring: "ring-slate-200/70 bg-slate-50", pill: "bg-slate-500/10 text-slate-700" },
  indigo: { ring: "ring-indigo-200/70 bg-indigo-50", pill: "bg-indigo-500/10 text-indigo-700" },
  emerald: { ring: "ring-emerald-200/70 bg-emerald-50", pill: "bg-emerald-500/10 text-emerald-700" },
};

const ROLE_STYLE: Record<WorkflowRole, string> = {
  PATIENT: "bg-sky-100 text-sky-800 border-sky-200",
  RECEPTION: "bg-amber-100 text-amber-800 border-amber-200",
  DOCTOR: "bg-teal-100 text-teal-800 border-teal-200",
  NURSE: "bg-violet-100 text-violet-800 border-violet-200",
  PHARMACIST: "bg-yellow-100 text-yellow-800 border-yellow-200",
  MANAGER: "bg-indigo-100 text-indigo-800 border-indigo-200",
  ADMIN: "bg-rose-100 text-rose-800 border-rose-200",
  SYSTEM: "bg-slate-200 text-slate-700 border-slate-300",
};

const ROLE_ORDER: WorkflowRole[] = [
  "PATIENT",
  "RECEPTION",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "MANAGER",
  "ADMIN",
  "SYSTEM",
];

function pickLocale<T extends { th: string; en: string }>(value: T, locale: string): string {
  return locale === "th" ? value.th : value.en;
}

interface WorkflowDialogProps {
  /** When provided, replaces the default ghost trigger button. */
  trigger?: React.ReactNode;
}

export function WorkflowDialog({ trigger }: WorkflowDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [phaseFilter, setPhaseFilter] = React.useState<string | null>(null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <BookOpen className="h-[14px] w-[14px] shrink-0" />
            <span className="truncate">{t("nav.workflow")}</span>
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        className="grid max-h-[88vh] max-w-3xl grid-rows-[auto_auto_1fr] gap-0 p-0 sm:rounded-2xl"
      >
        {/* Header — flush with content, no logo (per dialog rule, dense ref UI may opt out) */}
        <div className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-xl">{t("workflow.title")}</DialogTitle>
          <DialogDescription className="mt-1">{t("workflow.subtitle")}</DialogDescription>

          {/* Role legend */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ROLE_ORDER.map((role) => (
              <span
                key={role}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                  ROLE_STYLE[role],
                )}
              >
                <span className="font-mono text-[8px] opacity-70">●</span>
                {t(`workflow.role.${role}` as const)}
              </span>
            ))}
          </div>
        </div>

        {/* Phase tabs (horizontal scroll on small) */}
        <div className="flex gap-1.5 overflow-x-auto border-b bg-muted/30 px-6 py-2 scrollbar-thin">
          <PhaseTab
            label={t("workflow.tab_all")}
            active={phaseFilter === null}
            onClick={() => setPhaseFilter(null)}
          />
          {WORKFLOW.map((p) => {
            const fullTitle = pickLocale(p.title, locale);
            // "Phase 1 — Pre-Visit & Triage (Check-in)" → "Phase 1"
            const short = fullTitle.split(" — ")[0] ?? fullTitle;
            return (
              <PhaseTab
                key={p.id}
                label={short}
                active={phaseFilter === p.id}
                onClick={() => setPhaseFilter(p.id)}
              />
            );
          })}
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">
            {WORKFLOW.filter((p) => phaseFilter === null || p.id === phaseFilter).map(
              (phase, idx) => (
                <PhaseBlock
                  key={phase.id}
                  phase={phase}
                  index={WORKFLOW.indexOf(phase)}
                  fallbackIndex={idx}
                  locale={locale}
                  t={t}
                />
              ),
            )}

            {/* Behind the curtain — only on the "All" view */}
            {phaseFilter === null && (
              <div className="rounded-xl border border-dashed bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4 text-info" />
                  <p className="text-sm font-semibold">{t("workflow.platform.title")}</p>
                </div>
                <ul className="space-y-1.5 text-[12px] text-muted-foreground">
                  {PLATFORM_NOTES.map((note, i) => (
                    <li key={i} className="flex gap-2 leading-relaxed">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      <span>{pickLocale(note, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer hint */}
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-[12px] text-muted-foreground">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{t("workflow.footer_hint")}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PhaseTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

type Translator = ReturnType<typeof useTranslations>;

function PhaseBlock({
  phase,
  index,
  fallbackIndex,
  locale,
  t,
}: {
  phase: Phase;
  /** Original index in WORKFLOW (used for the "01" pill regardless of filter). */
  index: number;
  /** Fallback when the phase isn't in WORKFLOW (shouldn't happen). */
  fallbackIndex: number;
  locale: string;
  t: Translator;
}) {
  const Icon = ICON_MAP[phase.icon];
  const tone = TONE_STYLE[phase.tone];
  const num = (index >= 0 ? index : fallbackIndex) + 1;
  return (
    <section className="space-y-2.5">
      <div className={cn("flex items-start gap-3 rounded-xl p-3 ring-1", tone.ring)}>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone.pill)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
                tone.pill,
              )}
            >
              {String(num).padStart(2, "0")}
            </span>
            <h3 className="text-sm font-semibold leading-tight">
              {pickLocale(phase.title, locale)}
            </h3>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {pickLocale(phase.summary, locale)}
          </p>
        </div>
      </div>

      <ol className="relative ml-3 space-y-2 border-l border-dashed border-border pl-5">
        {phase.steps.map((step) => (
          <li key={step.id} className="relative">
            <span className="absolute -left-[27px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background font-mono text-[9px] font-bold tabular-nums text-muted-foreground">
              {step.id}
            </span>
            <StepCard step={step} locale={locale} t={t} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepCard({
  step,
  locale,
  t,
}: {
  step: Step;
  locale: string;
  t: Translator;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <h4 className="text-[13px] font-semibold leading-tight">
          {pickLocale(step.title, locale)}
        </h4>
        <div className="flex flex-wrap gap-1">
          {step.roles.map((role) => (
            <span
              key={role}
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0 text-[9px] font-bold leading-[1.4]",
                ROLE_STYLE[role],
              )}
            >
              {t(`workflow.role.${role}` as const)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground">
        {pickLocale(step.body, locale)}
      </p>
      {(step.event || step.link) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {step.event ? (
            <Badge
              variant="muted"
              className="font-mono text-[10px] [color:hsl(var(--info))]"
              title={t("workflow.event_tooltip")}
            >
              ⚡ {step.event}
            </Badge>
          ) : null}
          {step.link ? (
            <Link
              href={step.link.href}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              {pickLocale(step.link.label, locale)}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
