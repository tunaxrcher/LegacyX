"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlayCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/clientApi";

export function StartVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const t = useTranslations("visits");
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/visits/${visitId}/start`, {});
      toast.success(t("start_success"));
      router.refresh();
    } catch (err) {
      toast.error(t("check_in_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={start} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
      {t("start")}
    </Button>
  );
}
