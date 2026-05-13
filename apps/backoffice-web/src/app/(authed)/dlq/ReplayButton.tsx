"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/clientApi";

export default function ReplayButton({ id }: { id: string }) {
  const router = useRouter();
  const t = useTranslations("dlq");
  const [busy, setBusy] = React.useState(false);

  async function replay() {
    setBusy(true);
    try {
      await clientApi.post(`/api/admin/dlq/${id}/replay`, {});
      toast.success(t("replay_success"));
      router.refresh();
    } catch (err) {
      toast.error(t("replay_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={replay} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      {t("replay")}
    </Button>
  );
}
