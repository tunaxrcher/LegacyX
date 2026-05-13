import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Settings } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.settings")} />
      <EmptyState
        icon={<Settings className="h-5 w-5" />}
        title="Settings coming soon"
        description="Phase 6 will add real authentication, role/permission management, branch and resource configuration."
      />
    </div>
  );
}
