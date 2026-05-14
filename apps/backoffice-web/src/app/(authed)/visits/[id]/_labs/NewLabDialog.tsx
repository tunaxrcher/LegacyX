"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/clientApi";
import { COMMON_PANELS } from "./types";

export function NewLabDialog({
  visitId,
  patientId,
}: {
  visitId: string;
  patientId: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!panel.trim()) return;
    setBusy(true);
    try {
      await clientApi.post("/api/v1/lab/orders", {
        patient_id: patientId,
        visit_id: visitId,
        panel: panel.trim().toUpperCase(),
        notes: notes.trim() || undefined,
      });
      toast.success(t("labs.created"));
      setOpen(false);
      setPanel("");
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(t("labs.create_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t("labs.new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("labs.new")}</DialogTitle>
          <DialogDescription>{t("labs.new_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="panel">{t("labs.panel")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PANELS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPanel(p.code)}
                  title={p.labelTh}
                  className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                    panel === p.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.code}
                </button>
              ))}
            </div>
            <Input
              id="panel"
              value={panel}
              onChange={(e) => setPanel(e.target.value.toUpperCase())}
              placeholder="CBC / LIPID / HBA1C"
              className="font-mono uppercase"
              maxLength={40}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              {t("labs.panel_hint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("labs.notes")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !panel.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("labs.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
