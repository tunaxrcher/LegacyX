"use client";

/**
 * In-visit SOAP note editor — replaces the separate /emr/sign page so the
 * doctor never has to leave the visit context. Handles:
 *   - initial draft (no EMR yet → first sign creates version 1)
 *   - amendment flow (EMR exists & signed → bumps to version N+1, requires reason)
 * Content is encrypted server-side (AES-256-GCM) via /api/v1/emr/sign.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileSignature, Loader2, ShieldCheck, AlertTriangle, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";
import { AiAssistant } from "./AiAssistant";

export interface ExistingEmr {
  id: string;
  visitId: string;
  patientId: string;
  status: "DRAFT" | "SIGNED" | "AMENDED";
  currentVersion: number;
  signedAt: string | null;
  signedBy: string | null;
  contentHash: string | null;
  content: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    [k: string]: unknown;
  };
}

interface SoapPanelProps {
  visitId: string;
  patientId: string;
  existing: ExistingEmr | null;
  /**
   * Whether the current viewer is allowed to write/amend the EMR. Falsy = the
   * panel renders in pure read-only mode (no Sign button, all textareas
   * disabled). Server-side ABAC is the real enforcement; this just hides
   * actions the user can't perform.
   */
  canWrite: boolean;
}

export function SoapPanel({ visitId, patientId, existing, canWrite }: SoapPanelProps) {
  const router = useRouter();
  const t = useTranslations("emr");

  const [subjective, setSubjective] = React.useState(existing?.content.subjective ?? "");
  const [objective, setObjective] = React.useState(existing?.content.objective ?? "");
  const [assessment, setAssessment] = React.useState(existing?.content.assessment ?? "");
  const [plan, setPlan] = React.useState(existing?.content.plan ?? "");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Per ARCHITECTURE §4 (Locked EMR): once signed, the version is immutable.
  // Editing requires an explicit "Amend" action that creates version N+1
  // with a reason. We keep fields locked by default to surface that intent.
  const [amendMode, setAmendMode] = React.useState(false);
  // AI draft linkage: when an AI-generated draft is applied, remember its id
  // so we can forward it on sign (consume-on-sign pattern per ARCHITECTURE).
  const [acceptedDraftId, setAcceptedDraftId] = React.useState<string | null>(null);

  const applyDraft = React.useCallback(
    (
      content: {
        subjective?: string;
        objective?: string;
        assessment?: string;
        plan?: string;
      },
      draftId: string,
    ) => {
      if (content.subjective !== undefined) setSubjective(content.subjective);
      if (content.objective !== undefined) setObjective(content.objective);
      if (content.assessment !== undefined) setAssessment(content.assessment);
      if (content.plan !== undefined) setPlan(content.plan);
      setAcceptedDraftId(draftId);
    },
    [],
  );

  const isSigned = !!(existing && existing.status !== "DRAFT");
  // Editable when the user has write perm AND the EMR is either unsigned or
  // they've explicitly entered amend mode.
  const editable = canWrite && (!isSigned || amendMode);
  // We only call the API in "amend" mode when amending a signed EMR.
  const willAmend = isSigned && amendMode;

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (willAmend && !reason.trim()) {
      toast.error(t("reason_required"));
      return;
    }
    setBusy(true);
    try {
      await clientApi.post("/api/v1/emr/sign", {
        visit_id: visitId,
        patient_id: patientId,
        content: {
          subjective: subjective.trim(),
          objective: objective.trim(),
          assessment: assessment.trim(),
          plan: plan.trim(),
        },
        accepted_draft_id: acceptedDraftId ?? undefined,
        amendment_of: willAmend ? existing!.currentVersion : undefined,
        reason: willAmend ? reason : undefined,
      });
      toast.success(t("sign_success"));
      setReason("");
      setAmendMode(false);
      router.refresh();
    } catch (err) {
      toast.error(t("sign_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={sign} className="space-y-4">
      {editable && <AiAssistant visitId={visitId} onDraftApplied={applyDraft} />}

      {!canWrite && (
        <Alert variant="default">
          <Lock className="h-4 w-4" />
          <AlertTitle>{t("readonly_title")}</AlertTitle>
          <AlertDescription className="text-xs">
            {t("readonly_desc")}
          </AlertDescription>
        </Alert>
      )}

      {existing && (
        <Alert variant={isSigned ? "success" : "default"}>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            {isSigned ? (
              <>
                {t("status_signed")}
                <Badge variant="success">v{existing.currentVersion}</Badge>
              </>
            ) : (
              t("status_draft")
            )}
          </AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-xs">
              {existing.signedAt && (
                <div>
                  <span className="text-muted-foreground">{t("signed_at")}: </span>
                  {formatDateTime(existing.signedAt)}
                </div>
              )}
              {existing.contentHash && (
                <div>
                  <span className="text-muted-foreground">Hash: </span>
                  <span className="font-mono">{existing.contentHash.slice(0, 16)}…</span>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SOAP Note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subjective">{t("subjective")}</Label>
            <Textarea
              id="subjective"
              rows={3}
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="ผู้ป่วยมาด้วยอาการ…"
              readOnly={!editable}
              disabled={!editable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="objective">{t("objective")}</Label>
            <Textarea
              id="objective"
              rows={3}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="BP 120/80, T 37.0…"
              readOnly={!editable}
              disabled={!editable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assessment">{t("assessment")}</Label>
            <Textarea
              id="assessment"
              rows={3}
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="ICD-10: …"
              readOnly={!editable}
              disabled={!editable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan">{t("plan")}</Label>
            <Textarea
              id="plan"
              rows={3}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="แผนการรักษา…"
              readOnly={!editable}
              disabled={!editable}
            />
          </div>
        </CardContent>
      </Card>

      {willAmend && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("amend_label")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="reason">{t("reason")}</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reason")}
              required
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          AES-256-GCM · immutable version row
        </div>
        {/* Action zone — three mutually-exclusive states:
              1. canWrite=false                      → nothing (read-only)
              2. signed + !amendMode + canWrite      → "Amend" button (unlocks editing)
              3. !signed OR amendMode                → "Sign" / "Amend & Sign" submit */}
        {canWrite && isSigned && !amendMode && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAmendMode(true)}
          >
            <Pencil className="h-4 w-4" />
            {t("amend_label")}
          </Button>
        )}
        {editable && (
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            {busy
              ? t("signing")
              : willAmend
                ? (t("amend_and_sign"))
                : t("sign")}
          </Button>
        )}
      </div>
    </form>
  );
}
