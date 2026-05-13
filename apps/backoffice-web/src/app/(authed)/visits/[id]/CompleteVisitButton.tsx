"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/clientApi";

export function CompleteVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const t = useTranslations("visits");
  const [busy, setBusy] = React.useState(false);

  async function complete() {
    if (!confirm(t("complete_confirm"))) return;
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/visits/${visitId}/complete`, {});
      toast.success(t("complete_success"));
      router.refresh();
    } catch (err) {
      toast.error(t("complete_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="default" onClick={complete} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      {t("complete")}
    </Button>
  );
}
