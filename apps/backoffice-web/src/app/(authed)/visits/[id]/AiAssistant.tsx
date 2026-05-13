"use client";

/**
 * AI Assistant for the in-visit SOAP tab.
 *
 * Two entry points:
 *   1. 🎤 Voice capture  → Web Speech API (free, on-device, supports th-TH)
 *      → user can edit transcript → ✨ "Split with AI" → POST ai-service
 *      → AIDraft row returned → auto-populate S/O/A/P fields via onDraftApplied.
 *   2. 📄 Load existing draft → lists PENDING AIDrafts for this visit (e.g.
 *      INTAKE_SUMMARY created by patient before arrival) and applies chosen one.
 *
 * The draft.id is returned so the parent SOAP panel can send it as
 * `accepted_draft_id` when the doctor signs the EMR (links the draft to the
 * EMR version for audit / consume-on-sign).
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Mic, MicOff, Sparkles, Loader2, Inbox, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";

const AI_BASE = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "http://localhost:3002";

interface SoapContent {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

export interface AiDraftRow {
  id: string;
  type: string;
  status: string;
  modelName: string;
  modelVersion: string;
  draft: unknown;
  refId: string | null;
  createdAt: string;
}

interface AiAssistantProps {
  visitId: string;
  onDraftApplied: (content: SoapContent, draftId: string) => void;
}

// Minimal typing for Web Speech API (not in lib.dom)
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSession(): { tenantId: string; branchId: string } | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )lx_session=([^;]+)/);
  if (!m) return null;
  try {
    const s = JSON.parse(decodeURIComponent(m[1] ?? "")) as {
      tenantId: string;
      branchId: string;
    };
    return { tenantId: s.tenantId, branchId: s.branchId };
  } catch {
    return null;
  }
}

export function AiAssistant({ visitId, onDraftApplied }: AiAssistantProps) {
  const t = useTranslations("ai_asst");
  const [supported, setSupported] = React.useState(true);
  const [recording, setRecording] = React.useState(false);
  const [transcript, setTranscript] = React.useState("");
  const [interim, setInterim] = React.useState("");
  const [splitting, setSplitting] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);

  React.useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  function startRecording() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error(t("not_supported") ?? "Browser does not support speech recognition");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "th-TH";
    rec.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i] as unknown as ArrayLike<{ transcript: string }> & {
          isFinal?: boolean;
        };
        const alt = res[0];
        if (!alt) continue;
        if ((res as { isFinal?: boolean }).isFinal) {
          finalText += alt.transcript;
        } else {
          interimText += alt.transcript;
        }
      }
      if (finalText) {
        setTranscript((prev) => (prev ? prev + " " + finalText : finalText));
      }
      setInterim(interimText);
    };
    rec.onerror = (ev) => {
      toast.error(t("mic_error") ?? "Microphone error", { description: ev.error });
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
      setInterim("");
    };
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  async function splitWithAi() {
    const text = transcript.trim();
    if (!text) {
      toast.error(t("empty_transcript") ?? "Transcript is empty");
      return;
    }
    setSplitting(true);
    try {
      const sess = getSession();
      if (!sess) throw new Error("No session");
      const res = await fetch(`${AI_BASE}/ai/voice/note`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": sess.tenantId,
          "x-branch-id": sess.branchId,
        },
        body: JSON.stringify({
          transcript: text,
          locale: "th-TH",
          ref_id: visitId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { data } = (await res.json()) as { data: AiDraftRow };
      const content = (data.draft ?? {}) as SoapContent;
      onDraftApplied(content, data.id);
      toast.success(t("split_success") ?? "AI draft applied");
    } catch (err) {
      toast.error(t("split_failed") ?? "AI split failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSplitting(false);
    }
  }

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{t("title") ?? "AI Assistant"}</span>
          {!supported && (
            <Badge variant="warning" className="ml-auto">
              <AlertCircle className="h-3 w-3" /> Chrome / Edge required
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!recording ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={startRecording}
              disabled={!supported}
            >
              <Mic className="h-4 w-4" />
              {t("start_recording") ?? "บันทึกเสียง"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stopRecording}
              className="animate-pulse"
            >
              <MicOff className="h-4 w-4" />
              {t("stop_recording") ?? "หยุด"}
            </Button>
          )}

          <LoadDraftButton visitId={visitId} onDraftApplied={onDraftApplied} />

          {transcript && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={splitWithAi}
              disabled={splitting}
              className="ml-auto"
            >
              {splitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t("split_soap") ?? "แบ่งเป็น SOAP ด้วย AI"}
            </Button>
          )}
        </div>

        {(transcript || interim || recording) && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                {t("transcript") ?? "Transcript"}
              </label>
              {transcript && (
                <button
                  type="button"
                  onClick={() => setTranscript("")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("clear") ?? "clear"}
                </button>
              )}
            </div>
            <Textarea
              rows={3}
              value={transcript + (interim ? " " + interim : "")}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={t("transcript_placeholder") ?? "กดบันทึกเสียง หรือพิมพ์…"}
              className="font-mono text-xs"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadDraftButton({
  visitId,
  onDraftApplied,
}: {
  visitId: string;
  onDraftApplied: (content: SoapContent, draftId: string) => void;
}) {
  const t = useTranslations("ai_asst");
  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<AiDraftRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await clientApi.get<{ data: AiDraftRow[] }>(
        `/api/v1/ai/drafts?ref_id=${encodeURIComponent(visitId)}&status=PENDING`,
      );
      setDrafts(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function apply(d: AiDraftRow) {
    onDraftApplied((d.draft ?? {}) as SoapContent, d.id);
    setOpen(false);
    toast.success(t("draft_applied") ?? "Draft applied");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) load();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Inbox className="h-4 w-4" />
          {t("load_draft") ?? "โหลดจาก draft"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("load_draft") ?? "Load AI draft"}</DialogTitle>
          <DialogDescription>
            {t("load_draft_desc") ?? "Pending drafts linked to this visit"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {!loading && drafts.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("no_drafts") ?? "No pending drafts for this visit"}
            </div>
          )}
          {drafts.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => apply(d)}
              className="w-full rounded-md border p-3 text-left transition hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline">{d.type.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(d.createdAt)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {d.modelName}@{d.modelVersion}
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
