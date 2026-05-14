"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";

export type PatientPhoto = {
  id: string;
  kind: "BEFORE" | "AFTER" | "PROCEDURE" | "KYC_ID" | "KYC_SELFIE" | "OTHER";
  region: string | null;
  note: string | null;
  publicUrl: string;
  analysis: Record<string, unknown> | null;
  createdAt: string;
};

const KIND_VARIANT: Record<PatientPhoto["kind"], "info" | "success" | "warning" | "muted"> = {
  BEFORE: "info",
  AFTER: "success",
  PROCEDURE: "warning",
  KYC_ID: "muted",
  KYC_SELFIE: "muted",
  OTHER: "muted",
};

export function PhotosSection({
  visitId,
  patientId,
  photos,
  canWrite,
}: {
  visitId: string;
  patientId: string;
  photos: PatientPhoto[];
  canWrite: boolean;
}) {
  const t = useTranslations();
  const beforeAfter = photos.filter(
    (p) => p.kind === "BEFORE" || p.kind === "AFTER" || p.kind === "PROCEDURE",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("photos.title") ?? "Clinical Photos"}</h3>
          <p className="text-sm text-muted-foreground">
            {t("photos.subtitle") ?? "Before / after / procedure documentation · Gemini Vision-assisted"}
          </p>
        </div>
        {canWrite && (
          <UploadPhotoDialog visitId={visitId} patientId={patientId} />
        )}
      </div>

      {beforeAfter.length === 0 ? (
        <EmptyState
          icon={<Camera className="h-5 w-5" />}
          title={t("photos.empty_title") ?? "No photos uploaded"}
          description={t("photos.empty_desc") ?? "Upload before/after shots to document treatment progress"}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {beforeAfter.map((p) => (
            <PhotoCard key={p.id} photo={p} canWrite={canWrite} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  canWrite,
}: {
  photo: PatientPhoto;
  canWrite: boolean;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [busy, setBusy] = React.useState(false);

  async function analyze() {
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/photos/${photo.id}/analyze`, {});
      toast.success(t("photos.analyzed") ?? "Vision analysis complete");
      router.refresh();
    } catch (err) {
      toast.error(t("photos.analyze_failed") ?? "Vision analysis failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!window.confirm(t("photos.delete_confirm") ?? "Delete this photo?")) return;
    setBusy(true);
    try {
      await clientApi.delete(`/api/v1/photos/${photo.id}`);
      toast.success(t("photos.deleted") ?? "Photo deleted");
      router.refresh();
    } catch (err) {
      toast.error(t("photos.delete_failed") ?? "Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  const a = photo.analysis as
    | {
        summary?: string;
        observations?: string[];
        concerns?: string[];
        confidence?: number;
      }
    | null;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="aspect-square overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.publicUrl}
            alt={photo.kind}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant={KIND_VARIANT[photo.kind] ?? "muted"}>{photo.kind}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(photo.createdAt)}
          </span>
        </div>
        {photo.region && (
          <div className="text-xs">
            <span className="text-muted-foreground">{t("photos.region") ?? "Region"}: </span>
            {photo.region}
          </div>
        )}
        {photo.note && (
          <p className="text-xs text-muted-foreground line-clamp-2">{photo.note}</p>
        )}
        {a?.summary && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            <div className="flex items-center gap-1 font-medium">
              <Sparkles className="h-3 w-3 text-warning" />
              {t("photos.ai_analysis") ?? "AI analysis"}
              {typeof a.confidence === "number" && (
                <span className="ml-auto text-muted-foreground">
                  {Math.round(a.confidence * 100)}%
                </span>
              )}
            </div>
            <p>{a.summary}</p>
            {a.observations && a.observations.length > 0 && (
              <div>
                <span className="text-muted-foreground">
                  {t("photos.observations") ?? "Observations"}:
                </span>{" "}
                {a.observations.join(", ")}
              </div>
            )}
            {a.concerns && a.concerns.length > 0 && (
              <div className="text-warning">
                <span className="font-medium">
                  {t("photos.concerns") ?? "Concerns"}:
                </span>{" "}
                {a.concerns.join(", ")}
              </div>
            )}
          </div>
        )}
        {canWrite && (
          <div className="flex justify-end gap-1">
            {!photo.analysis && (
              <Button size="sm" variant="outline" onClick={analyze} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {t("photos.analyze") ?? "Analyze"}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={softDelete}
              disabled={busy}
              className="h-8 w-8 text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UploadPhotoDialog({
  visitId,
  patientId,
}: {
  visitId: string;
  patientId: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"BEFORE" | "AFTER" | "PROCEDURE">("BEFORE");
  const [region, setRegion] = React.useState("");
  const [note, setNote] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Build/cleanup an object URL when the user picks a file so we can show a
  // live preview before they commit to upload.
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setFile(null);
    setRegion("");
    setNote("");
    setPreviewUrl(null);
  }

  function pickFile(picked: File | null) {
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > 8 * 1024 * 1024) {
      toast.error(t("photos.file_too_large") ?? "File too large (max 8 MB)");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(picked.type)) {
      toast.error(t("photos.unsupported_type") ?? "Unsupported file type");
      return;
    }
    setFile(picked);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error(t("photos.pick_file") ?? "Please pick a file");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("visit_id", visitId);
      if (region.trim()) fd.append("region", region.trim());
      if (note.trim()) fd.append("note", note.trim());
      const res = await fetch(`/api/v1/patients/${patientId}/photos`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        // Try to surface the structured error our API returns. Falls back to
        // status text so the user always gets *something* useful.
        let message = `${res.status} ${res.statusText}`;
        try {
          const body = (await res.json()) as {
            error?: { code?: string; message?: string };
          };
          if (body?.error?.message) {
            message = body.error.code
              ? `[${body.error.code}] ${body.error.message}`
              : body.error.message;
          }
        } catch {
          /* not JSON */
        }
        throw new Error(message);
      }
      toast.success(t("photos.uploaded") ?? "Photo uploaded");
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(t("photos.upload_failed") ?? "Upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Camera className="h-4 w-4" />
          {t("photos.upload") ?? "Upload Photo"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("photos.upload") ?? "Upload Photo"}</DialogTitle>
          <DialogDescription>
            {t("photos.upload_desc") ??
              "JPEG / PNG / WebP up to 8 MB · stored privately"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("photos.kind") ?? "Kind"}</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as "BEFORE" | "AFTER" | "PROCEDURE")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BEFORE">BEFORE</SelectItem>
                  <SelectItem value="AFTER">AFTER</SelectItem>
                  <SelectItem value="PROCEDURE">PROCEDURE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">{t("photos.region") ?? "Region"}</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t("photos.region_placeholder") ?? "left cheek / forehead"}
                maxLength={80}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">{t("photos.file") ?? "Image file"}</Label>
            <Input
              id="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              required
            />
            {previewUrl && (
              <div className="relative overflow-hidden rounded-lg border bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  className="max-h-72 w-full object-contain"
                />
                {file && (
                  <div className="border-t bg-background/80 px-2 py-1 text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">{t("photos.note") ?? "Staff note"}</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !file}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("photos.upload") ?? "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
