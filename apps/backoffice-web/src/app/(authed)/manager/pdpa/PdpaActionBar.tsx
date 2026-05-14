"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileDown, UserX, Loader2, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PatientCombobox, type PatientOption } from "@/components/patient-combobox";
import { clientApi } from "@/lib/clientApi";

interface Props {
  /** Role codes from the current session — used to gate the irreversible
   *  `Anonymise` action. Both MANAGER and ADMIN now hold
   *  `pdpa:anonymize:tenant`; users with neither role see the action
   *  disabled (defense-in-depth — the server enforces the real check). */
  roles: string[];
}

/** Patient detail returned by `/api/v1/patients/[id]` — only the bits we
 *  need for the confirmation summary. The endpoint returns up to 20 of
 *  each child collection; that is plenty for a "looks right?" preview. */
interface PatientSummary {
  id: string;
  hn: string;
  firstName: string;
  lastName: string;
  status: string;
  gender: string | null;
  dob: string | null;
  createdAt: string;
  appointments?: unknown[];
  visits?: unknown[];
  wallets?: unknown[];
}

export function PdpaActionBar({ roles }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const canAnonymise = roles.some((r) => r === "ADMIN" || r === "MANAGER");

  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [summary, setSummary] = React.useState<PatientSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<"export" | "anonymize" | null>(null);

  // Whenever the picker selects a different patient, fetch the lightweight
  // summary so the operator can eyeball-confirm before running anything.
  React.useEffect(() => {
    if (!patient) {
      setSummary(null);
      return;
    }
    const ctrl = new AbortController();
    setSummaryLoading(true);
    clientApi
      .get<{ data: PatientSummary }>(`/api/v1/patients/${patient.id}`, {
        signal: ctrl.signal,
      })
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
    return () => ctrl.abort();
  }, [patient]);

  const reasonOk = reason.trim().length >= 8;
  const validInputs = patient !== null && reasonOk;

  async function runExport() {
    if (!validInputs || !patient) return;
    setBusy("export");
    try {
      const res = await clientApi.post<{
        data: {
          manifest: unknown;
          archive: { key: string; sha256: string; size: number };
        };
      }>("/api/v1/manager/pdpa/export", {
        patient_id: patient.id,
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
      a.download = `pdpa-export-${patient.hn}-${patient.id}.json`;
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
    if (!validInputs || !patient || !canAnonymise) return;
    if (!window.confirm(t("pdpa.anonymize_confirm"))) return;
    setBusy("anonymize");
    try {
      await clientApi.post("/api/v1/manager/pdpa/anonymize", {
        patient_id: patient.id,
        reason: reason.trim(),
      });
      toast.success(t("pdpa.anonymize_success"));
      setPatient(null);
      setSummary(null);
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
          <Label>{t("pdpa.patient")}</Label>
          <PatientCombobox value={patient} onChange={setPatient} />
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

      {patient && (
        <PatientSummaryCard
          patient={patient}
          summary={summary}
          loading={summaryLoading}
        />
      )}

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
          disabled={!validInputs || busy !== null || !canAnonymise}
          onClick={runAnonymize}
          title={canAnonymise ? undefined : t("pdpa.anonymize_locked")}
        >
          {busy === "anonymize" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : !canAnonymise ? (
            <Lock className="h-4 w-4" />
          ) : (
            <UserX className="h-4 w-4" />
          )}
          {t("pdpa.anonymize")}
        </Button>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {canAnonymise
            ? t("pdpa.action_help_authorized")
            : t("pdpa.action_help_unauthorized")}
        </span>
      </div>
    </div>
  );
}

function PatientSummaryCard({
  patient,
  summary,
  loading,
}: {
  patient: PatientOption;
  summary: PatientSummary | null;
  loading: boolean;
}) {
  const t = useTranslations();
  // Surface the destructive-already-merged case as a hard warning — the API
  // would also reject it (`Conflict`) but better to show it before the user
  // even tries.
  const merged = summary?.status === "MERGED";
  const inactive = summary?.status === "INACTIVE";
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div>
          <span className="text-muted-foreground">{t("patients.hn")}: </span>
          <span className="font-mono font-semibold">{patient.hn}</span>
        </div>
        <div className="font-medium">
          {patient.firstName} {patient.lastName}
        </div>
        {summary?.status && (
          <Badge variant={merged ? "destructive" : inactive ? "muted" : "success"}>
            {summary.status}
          </Badge>
        )}
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      {summary && !loading && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>
            {t("pdpa.summary_visits")}: {summary.visits?.length ?? 0}
            {(summary.visits?.length ?? 0) >= 20 && "+"}
          </span>
          <span>
            {t("pdpa.summary_appointments")}: {summary.appointments?.length ?? 0}
            {(summary.appointments?.length ?? 0) >= 20 && "+"}
          </span>
          <span>
            {t("pdpa.summary_wallets")}: {summary.wallets?.length ?? 0}
          </span>
          {summary.dob && (
            <span>
              {t("patients.dob")}: {new Date(summary.dob).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      {merged && (
        <div className="mt-2 flex items-center gap-1 text-destructive">
          <AlertTriangle className="h-3 w-3" />
          <span>{t("pdpa.summary_merged_warning")}</span>
        </div>
      )}
    </div>
  );
}
