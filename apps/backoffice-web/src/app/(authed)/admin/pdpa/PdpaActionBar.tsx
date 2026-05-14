"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileDown, UserX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/clientApi";

export function PdpaActionBar() {
  const router = useRouter();
  const t = useTranslations();
  const [patientId, setPatientId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<"export" | "anonymize" | null>(null);

  const validInputs = patientId.trim().length > 6 && reason.trim().length >= 8;

  async function runExport() {
    if (!validInputs) return;
    setBusy("export");
    try {
      const res = await clientApi.post<{
        data: {
          manifest: unknown;
          archive: { key: string; sha256: string; size: number };
        };
      }>("/api/v1/admin/pdpa/export", {
        patient_id: patientId.trim(),
        reason: reason.trim(),
      });
      // Download the manifest as a JSON file. The server already wrote the
      // audit row + outbox event; this is just the operator's local copy.
      const blob = new Blob([JSON.stringify(res.data.manifest, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pdpa-export-${patientId.trim()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("pdpa.export_success"), {
        description: `sha256: ${res.data.archive.sha256.slice(0, 16)}…`,
      });
      router.refresh();
    } catch (err) {
      toast.error(t("pdpa.export_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  }

  async function runAnonymize() {
    if (!validInputs) return;
    if (
      !window.confirm(t("pdpa.anonymize_confirm"))
    ) {
      return;
    }
    setBusy("anonymize");
    try {
      await clientApi.post("/api/v1/admin/pdpa/anonymize", {
        patient_id: patientId.trim(),
        reason: reason.trim(),
      });
      toast.success(t("pdpa.anonymize_success"));
      setPatientId("");
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(t("pdpa.anonymize_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pdpa-patient-id">{t("pdpa.patient_id")}</Label>
          <Input
            id="pdpa-patient-id"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="cl..."
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pdpa-reason">{t("pdpa.reason")}</Label>
          <Textarea
            id="pdpa-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("pdpa.reason_placeholder")}
            rows={2}
            minLength={8}
            maxLength={500}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!validInputs || busy !== null}
          onClick={runExport}
        >
          {busy === "export" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          {t("pdpa.export")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!validInputs || busy !== null}
          onClick={runAnonymize}
        >
          {busy === "anonymize" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserX className="h-4 w-4" />
          )}
          {t("pdpa.anonymize")}
        </Button>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {t("pdpa.action_help")}
        </span>
      </div>
    </div>
  );
}
