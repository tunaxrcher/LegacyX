"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Tag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientApi } from "@/lib/clientApi";

export function ApplyPromoButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 2) {
      toast.error(t("promotions.invalid_code"));
      return;
    }
    setBusy(true);
    try {
      const res = await clientApi.post<{
        data: {
          amountDiscounted: number;
          newTotal: number;
          promotion: { code: string; type: string };
          idempotent?: boolean;
        };
      }>(`/api/v1/invoices/${invoiceId}/apply-promo`, {
        code: code.trim().toUpperCase(),
      });
      if (res.data.idempotent) {
        toast.info(t("promotions.already_applied"));
      } else {
        toast.success(t("promotions.applied_success"), {
          description: `-฿${res.data.amountDiscounted.toLocaleString()} → ฿${res.data.newTotal.toLocaleString()}`,
        });
      }
      setOpen(false);
      setCode("");
      router.refresh();
    } catch (err) {
      toast.error(t("promotions.applied_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tag className="h-4 w-4" /> {t("promotions.apply")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("promotions.apply_title")}</DialogTitle>
          <DialogDescription>
            {t("promotions.apply_desc", { number: invoiceNumber })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="promo-code">{t("promotions.code")}</Label>
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="font-mono uppercase"
              autoComplete="off"
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || code.trim().length < 2}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("promotions.apply")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
