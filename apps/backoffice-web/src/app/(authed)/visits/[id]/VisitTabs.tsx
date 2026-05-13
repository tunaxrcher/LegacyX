"use client";

/**
 * Client-side Tab switcher for the visit detail page. Holds state; server
 * pre-renders each tab's content tree and passes them as React children props.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VisitTabsProps {
  overview: React.ReactNode;
  soap: React.ReactNode;
  orders: React.ReactNode;
  procedures: React.ReactNode;
  billing: React.ReactNode;
  procedureCount: number;
  orderCount: number;
  defaultTab?: string;
}

export function VisitTabs({
  overview,
  soap,
  orders,
  procedures,
  billing,
  procedureCount,
  orderCount,
  defaultTab = "overview",
}: VisitTabsProps) {
  const t = useTranslations();

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start gap-1 rounded-md bg-muted p-1">
        <TabsTrigger value="overview">{t("visits.tab_overview") ?? "Overview"}</TabsTrigger>
        <TabsTrigger value="soap">{t("visits.tab_soap") ?? "SOAP Note"}</TabsTrigger>
        <TabsTrigger value="orders">
          {t("visits.tab_orders") ?? "Orders"} {orderCount > 0 && `(${orderCount})`}
        </TabsTrigger>
        {procedureCount > 0 && (
          <TabsTrigger value="procedures">
            {t("visits.tab_procedures") ?? "Procedures"} ({procedureCount})
          </TabsTrigger>
        )}
        <TabsTrigger value="billing">{t("visits.tab_billing") ?? "Billing"}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="soap">{soap}</TabsContent>
      <TabsContent value="orders">{orders}</TabsContent>
      {procedureCount > 0 && <TabsContent value="procedures">{procedures}</TabsContent>}
      <TabsContent value="billing">{billing}</TabsContent>
    </Tabs>
  );
}
