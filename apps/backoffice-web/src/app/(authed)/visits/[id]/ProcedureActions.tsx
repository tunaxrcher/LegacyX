"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlayCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

interface Procedure {
  id: string;
  status: string;
  procedureCode: string;
}

interface Wallet {
  id: string;
  balance: number;
  product: { name: string } | null;
}

export function ProcedureActions({
  procedure,
  wallets,
}: {
  procedure: Procedure;
  wallets: Wallet[];
}) {
  if (procedure.status === "COMPLETED" || procedure.status === "CANCELLED") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="inline-flex items-center gap-1">
      {procedure.status === "SCHEDULED" && <StartButton id={procedure.id} />}
      <CompleteDialog procedure={procedure} wallets={wallets} />
      <CancelDialog id={procedure.id} />
    </div>
  );
}

function StartButton({ id }: { id: string }) {
  const router = useRouter();
  const t = useTranslations("procedures");
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/procedures/${id}/start`, {});
      toast.success(t("start_success"));
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
      {t("start")}
    </Button>
  );
}

function CompleteDialog({
  procedure,
  wallets,
}: {
  procedure: Procedure;
  wallets: Wallet[];
}) {
  const router = useRouter();
  const t = useTranslations("procedures");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [walletId, setWalletId] = React.useState<string>("__none");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const usable = wallets.filter((w) => w.balance > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/procedures/${procedure.id}/complete`, {
        wallet_id: walletId !== "__none" ? walletId : undefined,
        notes: notes || undefined,
      });
      toast.success(t("complete_success"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("complete_failed"), {
        description: String((err as Error).message ?? err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <CheckCircle2 className="h-4 w-4" />
          {t("complete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("complete")} · {procedure.procedureCode}
          </DialogTitle>
          <DialogDescription>{t("complete_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("use_wallet")}</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("no_wallet")}</SelectItem>
                {usable.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.product?.name ?? w.id.slice(-6)} · {w.balance}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("use_wallet_hint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{tCommon("notes") ?? "Notes"}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("complete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ id }: { id: string }) {
  const router = useRouter();
  const t = useTranslations("procedures");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/procedures/${id}/cancel`, { reason });
      toast.success(t("cancel_success"));
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <XCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancel")}</DialogTitle>
          <DialogDescription>{t("cancel_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("reason")}</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || reason.length < 3}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
