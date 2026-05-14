"use client";

import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  TestTube,
  Truck,
} from "lucide-react";

const STEPS = [
  { icon: ClipboardList, role: "DOCTOR", labelKey: "labs.step_doctor" },
  { icon: TestTube, role: "NURSE", labelKey: "labs.step_collect" },
  { icon: Truck, role: "NURSE", labelKey: "labs.step_process" },
  { icon: CheckCircle2, role: "NURSE", labelKey: "labs.step_result" },
] as const;

export function FlowGuide() {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-info/30 bg-info/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-info">
        <Lightbulb className="h-3.5 w-3.5" />
        {t("labs.flow_title")}
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <li
              key={idx}
              className="flex items-start gap-2 rounded-md bg-background p-2 text-xs"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block font-mono text-[10px] font-bold text-info/80">
                  {idx + 1}. {s.role}
                </span>
                <span className="text-foreground">{t(s.labelKey)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
