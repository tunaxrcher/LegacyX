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
  labs?: React.ReactNode;
  photos?: React.ReactNode;
  procedureCount: number;
  orderCount: number;
  labCount?: number;
  photoCount?: number;
  defaultTab?: string;
}

export function VisitTabs({
  overview,
  soap,
  orders,
  procedures,
  billing,
  labs,
  photos,
  procedureCount,
  orderCount,
  labCount = 0,
  photoCount = 0,
  defaultTab = "overview",
}: VisitTabsProps) {
  const t = useTranslations();

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start gap-1 rounded-md bg-muted p-1">
        <TabsTrigger value="overview">{t("visits.tab_overview")}</TabsTrigger>
        <TabsTrigger value="soap">{t("visits.tab_soap")}</TabsTrigger>
        <TabsTrigger value="orders">
          {t("visits.tab_orders")} {orderCount > 0 && `(${orderCount})`}
        </TabsTrigger>
        {procedureCount > 0 && (
          <TabsTrigger value="procedures">
            {t("visits.tab_procedures")} ({procedureCount})
          </TabsTrigger>
        )}
        {labs !== undefined && (
          <TabsTrigger value="labs">
            {t("visits.tab_labs")} {labCount > 0 && `(${labCount})`}
          </TabsTrigger>
        )}
        {photos !== undefined && (
          <TabsTrigger value="photos">
            {t("visits.tab_photos")} {photoCount > 0 && `(${photoCount})`}
          </TabsTrigger>
        )}
        <TabsTrigger value="billing">{t("visits.tab_billing")}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="soap">{soap}</TabsContent>
      <TabsContent value="orders">{orders}</TabsContent>
      {procedureCount > 0 && <TabsContent value="procedures">{procedures}</TabsContent>}
      {labs !== undefined && <TabsContent value="labs">{labs}</TabsContent>}
      {photos !== undefined && <TabsContent value="photos">{photos}</TabsContent>}
      <TabsContent value="billing">{billing}</TabsContent>
    </Tabs>
  );
}
