"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AllergyConflict {
  allergyId: string;
  substance: string;
  severity: "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING";
  productId: string;
  productName: string;
  matchedIngredient: string;
}

const SEVERITY_VARIANT: Record<
  AllergyConflict["severity"],
  "warning" | "destructive" | "muted"
> = {
  MILD: "muted",
  MODERATE: "warning",
  SEVERE: "destructive",
  LIFE_THREATENING: "destructive",
};

export function AllergyAlertDialog({
  open,
  conflicts,
  onCancel,
  onOverride,
}: {
  open: boolean;
  conflicts: AllergyConflict[];
  onCancel: () => void;
  onOverride: (allergyIds: string[]) => void;
}) {
  const t = useTranslations();
  const lifeThreatening = conflicts.some((c) => c.severity === "LIFE_THREATENING");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className={cn(
          "max-w-lg border-2",
          lifeThreatening ? "border-destructive" : "border-warning",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert
              className={cn(
                "h-5 w-5",
                lifeThreatening ? "text-destructive" : "text-warning",
              )}
            />
            {t("allergies.alert_title")}
          </DialogTitle>
          <DialogDescription>{t("allergies.alert_desc")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {conflicts.map((c) => (
            <li
              key={`${c.allergyId}-${c.productId}`}
              className={cn(
                "rounded-md border p-3",
                (c.severity === "SEVERE" || c.severity === "LIFE_THREATENING") &&
                  "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="font-semibold">{c.productName}</span>
                <span className="text-muted-foreground">{t("allergies.contains")}</span>
                <span className="font-mono text-sm">{c.matchedIngredient}</span>
                <Badge variant={SEVERITY_VARIANT[c.severity]} className="text-[10px]">
                  {t(`allergies.severity.${c.severity}` as const)}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("allergies.patient_allergic_to")}{" "}
                <span className="font-semibold text-foreground">{c.substance}</span>
              </p>
            </li>
          ))}
        </ul>

        <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning-foreground/80">
          {t("allergies.override_warning")}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("allergies.cancel_order")}
          </Button>
          <Button
            type="button"
            variant={lifeThreatening ? "destructive" : "default"}
            onClick={() => onOverride([...new Set(conflicts.map((c) => c.allergyId))])}
          >
            {t("allergies.acknowledge_and_proceed")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
