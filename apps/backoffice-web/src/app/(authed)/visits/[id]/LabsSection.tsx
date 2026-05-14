"use client";

import { useTranslations } from "next-intl";
import { Beaker } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { FlowGuide } from "./_labs/FlowGuide";
import { NewLabDialog } from "./_labs/NewLabDialog";
import { OrderRow } from "./_labs/OrderRow";
import type { LabOrder } from "./_labs/types";

// Re-export shapes so existing imports (`LabsSection.LabOrder`, etc.) keep
// working without churn at the call sites.
export type { LabOrder };

export function LabsSection({
  visitId,
  patientId,
  orders,
  canOrder,
  canCollect,
  canResult,
}: {
  visitId: string;
  patientId: string;
  orders: LabOrder[];
  canOrder: boolean;
  canCollect: boolean;
  canResult: boolean;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("labs.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("labs.subtitle")}</p>
        </div>
        {canOrder && <NewLabDialog visitId={visitId} patientId={patientId} />}
      </div>

      <FlowGuide />

      {orders.length === 0 ? (
        <EmptyState
          icon={<Beaker className="h-5 w-5" />}
          title={t("labs.empty_title")}
          description={
            canOrder
              ? t("labs.empty_desc_doctor")
              : canCollect || canResult
                ? t("labs.empty_desc_nurse")
                : t("labs.empty_desc")
          }
        />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              canCollect={canCollect}
              canResult={canResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}
