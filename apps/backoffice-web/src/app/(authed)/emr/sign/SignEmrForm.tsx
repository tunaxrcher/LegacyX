"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileSignature, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { clientApi } from "@/lib/clientApi";

interface SignResult {
  emrId: string;
  version: number;
  visitId: string;
  contentHash?: string;
}

export default function SignEmrForm() {
  const t = useTranslations("emr");

  const [visitId, setVisitId] = React.useState("");
  const [patientId, setPatientId] = React.useState("");
  const [subjective, setSubjective] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [assessment, setAssessment] = React.useState("");
  const [plan, setPlan] = React.useState("");
  const [isAmendment, setIsAmendment] = React.useState(false);
  const [amendmentOf, setAmendmentOf] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<SignResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const content = {
        subjective: subjective.trim(),
        objective: objective.trim(),
        assessment: assessment.trim(),
        plan: plan.trim(),
      };
      const data = await clientApi.post<SignResult>("/api/v1/emr/sign", {
        visit_id: visitId,
        patient_id: patientId,
        content,
        amendment_of: isAmendment && amendmentOf ? Number(amendmentOf) : undefined,
        reason: isAmendment && reason ? reason : undefined,
      });
      setResult(data);
      toast.success(t("sign_success"));
    } catch (err) {
      toast.error(t("sign_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visit & Patient</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="visit_id">{t("visit_id")}</Label>
            <Input
              id="visit_id"
              required
              value={visitId}
              onChange={(e) => setVisitId(e.target.value)}
              placeholder="vst_..."
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient_id">{t("patient_id")}</Label>
            <Input
              id="patient_id"
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="cmp..."
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

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
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amendment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent/30">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={isAmendment}
              onChange={(e) => setIsAmendment(e.target.checked)}
            />
            <div>
              <div className="text-sm font-medium">{t("amend_label")}</div>
              <div className="text-xs text-muted-foreground">
                Creates a new immutable version linked to the original.
              </div>
            </div>
          </label>

          {isAmendment && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amend_of">{t("amend_of")}</Label>
                <Input
                  id="amend_of"
                  type="number"
                  value={amendmentOf}
                  onChange={(e) => setAmendmentOf(e.target.value)}
                  placeholder="version number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">{t("reason")}</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="reason for amendment"
                  required={isAmendment}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>{t("sign_success")}</AlertTitle>
          <AlertDescription>
            <div className="space-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">EMR ID: </span>
                <span className="font-mono">{result.emrId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("version")}: </span>
                <span className="font-mono">{result.version}</span>
              </div>
              {result.contentHash && (
                <div>
                  <span className="text-muted-foreground">Hash: </span>
                  <span className="font-mono">{result.contentHash}</span>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          AES-256-GCM encrypted · immutable version row
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
          {busy ? t("signing") : t("sign")}
        </Button>
      </div>
    </form>
  );
}
