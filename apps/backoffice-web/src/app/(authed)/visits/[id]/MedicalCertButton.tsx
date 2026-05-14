"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Loader2, Download } from "lucide-react";
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

export function MedicalCertButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [diagnosis, setDiagnosis] = React.useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [recommendation, setRecommendation] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (diagnosis.trim().length < 1 || from > to) {
      toast.error(t("medical_cert.validation_failed"));
      return;
    }
    setBusy(true);
    try {
      const res = await clientApi.post<{
        data: { id: string; type: string; status: string };
      }>(`/api/v1/visits/${visitId}/medical-cert`, {
        diagnosis: diagnosis.trim(),
        period_from: from,
        period_to: to,
        recommendation: recommendation.trim() || undefined,
      });
      toast.success(t("medical_cert.issued_success"), {
        description: `Doc ${res.data.id.slice(-8)} — ${res.data.status}`,
        action: {
          label: <Download className="h-4 w-4" />,
          onClick: () =>
            window.open(`/api/v1/documents/${res.data.id}/download`, "_blank"),
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("medical_cert.issued_failed"), {
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
          <FileText className="h-4 w-4" /> {t("medical_cert.issue")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("medical_cert.issue")}</DialogTitle>
          <DialogDescription>{t("medical_cert.issue_subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dx">{t("medical_cert.diagnosis")}</Label>
            <Textarea
              id="dx"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder={t("medical_cert.diagnosis_placeholder")}
              rows={3}
              maxLength={400}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="from">{t("medical_cert.period_from")}</Label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">{t("medical_cert.period_to")}</Label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec">{t("medical_cert.recommendation")}</Label>
            <Input
              id="rec"
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              placeholder={t("medical_cert.recommendation_placeholder")}
              maxLength={400}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || diagnosis.trim().length === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("medical_cert.issue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
