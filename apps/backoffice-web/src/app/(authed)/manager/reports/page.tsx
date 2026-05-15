import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSessionFromCookies } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ManagerReportsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations("reports");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ReportsClient />
    </div>
  );
}
