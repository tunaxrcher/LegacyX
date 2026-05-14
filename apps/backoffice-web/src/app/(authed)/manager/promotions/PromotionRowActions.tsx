"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientApi } from "@/lib/clientApi";

type Promotion = {
  id: string;
  code: string;
  active: boolean;
};

export function PromotionRowActions({ promotion }: { promotion: Promotion }) {
  const router = useRouter();
  const t = useTranslations();
  const [busy, setBusy] = React.useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/promotions/${promotion.id}`, {
        active: !promotion.active,
      });
      toast.success(
        promotion.active
          ? t("promotions.deactivated")
          : t("promotions.activated"),
      );
      router.refresh();
    } catch (err) {
      toast.error(t("common.submit"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!window.confirm(t("promotions.delete_confirm", { code: promotion.code }))) {
      return;
    }
    setBusy(true);
    try {
      await clientApi.delete(`/api/v1/promotions/${promotion.id}`);
      toast.success(t("promotions.deleted"));
      router.refresh();
    } catch (err) {
      toast.error(t("common.submit"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={toggleActive}>
          {promotion.active ? (
            <>
              <PowerOff className="h-4 w-4" />
              {t("promotions.deactivate")}
            </>
          ) : (
            <>
              <Power className="h-4 w-4" />
              {t("promotions.activate")}
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={softDelete} className="text-destructive">
          <Trash2 className="h-4 w-4" />
          {t("promotions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
