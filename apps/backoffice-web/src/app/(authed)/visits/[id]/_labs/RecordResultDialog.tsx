"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import {
  isAllowedLabAttachment,
  MAX_LAB_ATTACHMENT_BYTES,
  uploadLabAttachment,
} from "./upload";

type ResultRow = { id: string; key: string; value: string; unit: string };

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyRow(): ResultRow {
  return { id: genId(), key: "", value: "", unit: "" };
}

function rowsFromTemplate(panel: string): ResultRow[] {
  const tmpl = COMMON_PANELS.find((p) => p.code === panel);
  if (!tmpl?.tests?.length) return [emptyRow(), emptyRow()];
  return tmpl.tests.map((t) => ({
    id: genId(),
    key: t.key,
    value: "",
    unit: t.unit ?? "",
  }));
}

/**
 * Record-result dialog supports two entry modes:
 *
 * 1. **Structured** (default) — table-style key/value/unit rows. We pre-seed
 *    rows from the panel's canonical test list (`COMMON_PANELS`) so techs can
 *    fill in numbers without re-typing labels.
 * 2. **Raw text** — free-form `KEY: VALUE` lines, one per line. Useful when the
 *    test is unusual or the lab returns an opinionated layout.
 *
 * Optional file attachment (PDF or image up to 10 MB) is uploaded first via
 * `uploadLabAttachment()` and the returned key is sent alongside the payload.
 */
export function RecordResultDialog({
  orderId,
  panel,
}: {
  orderId: string;
  panel: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<ResultRow[]>(() =>
    rowsFromTemplate(panel),
  );
  const [rawMode, setRawMode] = React.useState(false);
  const [rawText, setRawText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Live preview of the picked attachment (image only — PDFs show a name chip).
  React.useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setRows(rowsFromTemplate(panel));
    setRawMode(false);
    setRawText("");
    setFile(null);
    setPreviewUrl(null);
  }

  function pickFile(picked: File | null) {
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_LAB_ATTACHMENT_BYTES) {
      toast.error(t("labs.file_too_large"));
      return;
    }
    if (!isAllowedLabAttachment(picked)) {
      toast.error(t("labs.unsupported_type"));
      return;
    }
    setFile(picked);
  }

  function buildPayload(): Record<string, string> | null {
    if (rawMode) {
      const out: Record<string, string> = {};
      for (const line of rawText.split("\n")) {
        const idx = line.indexOf(":");
        if (idx <= 0) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) out[k] = v;
      }
      return Object.keys(out).length > 0 ? out : null;
    }
    const out: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      const v = r.value.trim();
      if (!k || !v) continue;
      out[k] = r.unit.trim() ? `${v} ${r.unit.trim()}` : v;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = buildPayload();
      if (!payload) {
        toast.error(t("labs.parse_failed"));
        return;
      }
      const fileKey = file ? await uploadLabAttachment(file) : undefined;
      await clientApi.post(`/api/v1/lab/orders/${orderId}/result`, {
        payload,
        file_key: fileKey,
      });
      toast.success(t("labs.resulted"));
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(t("labs.result_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function setRow(idx: number, patch: Partial<ResultRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setRows((rs) =>
      rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== idx),
    );
  }

  function applyTemplate() {
    setRows(rowsFromTemplate(panel));
    toast.success(t("labs.template_applied"));
  }

  const hasTemplate = !!COMMON_PANELS.find((p) => p.code === panel)?.tests;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={busy}>
          <FileText className="h-3 w-3" />
          {t("labs.record_result")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("labs.record_result")} — {panel}
          </DialogTitle>
          <DialogDescription>{t("labs.result_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("labs.entry_mode")}:</span>
              <Button
                type="button"
                variant={!rawMode ? "default" : "outline"}
                size="sm"
                className="h-7"
                onClick={() => setRawMode(false)}
              >
                {t("labs.mode_structured")}
              </Button>
              <Button
                type="button"
                variant={rawMode ? "default" : "outline"}
                size="sm"
                className="h-7"
                onClick={() => setRawMode(true)}
              >
                {t("labs.mode_raw")}
              </Button>
            </div>
            {!rawMode && hasTemplate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={applyTemplate}
              >
                <ClipboardList className="h-3 w-3" />
                {t("labs.use_template")}
              </Button>
            )}
          </div>

          {!rawMode ? (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-muted-foreground">
                <div className="col-span-4">{t("labs.test")}</div>
                <div className="col-span-4">{t("labs.value")}</div>
                <div className="col-span-3">{t("labs.unit")}</div>
                <div className="col-span-1" />
              </div>
              <div className="space-y-1.5">
                {rows.map((row, idx) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-4 h-8 font-mono text-xs"
                      value={row.key}
                      onChange={(e) => setRow(idx, { key: e.target.value })}
                      placeholder="WBC"
                    />
                    <Input
                      className="col-span-4 h-8 font-mono text-xs"
                      value={row.value}
                      onChange={(e) => setRow(idx, { value: e.target.value })}
                      placeholder="7.4"
                    />
                    <Input
                      className="col-span-3 h-8 font-mono text-xs text-muted-foreground"
                      value={row.unit}
                      onChange={(e) => setRow(idx, { unit: e.target.value })}
                      placeholder="x10^9/L"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="col-span-1 h-8 w-full p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(idx)}
                      title={t("labs.remove_row")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => setRows((rs) => [...rs, emptyRow()])}
              >
                <Plus className="h-3 w-3" />
                {t("labs.add_row")}
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={"WBC: 7.4 x10^9/L\nHGB: 13.2 g/dL\nPLT: 250"}
                rows={6}
                className="font-mono text-sm"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {t("labs.raw_hint")}
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="attachment" className="text-sm font-semibold">
                {t("labs.attachment")}{" "}
                <span className="font-normal text-muted-foreground">
                  ({t("labs.optional")})
                </span>
              </Label>
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs text-muted-foreground"
                  onClick={() => setFile(null)}
                >
                  <X className="h-3 w-3" />
                  {t("labs.clear")}
                </Button>
              )}
            </div>
            <Input
              id="attachment"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("labs.attachment_hint")}
            </p>
            {file && (
              <div className="rounded-md border bg-background p-2 text-xs">
                {previewUrl ? (
                  <div className="space-y-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="attachment preview"
                      className="max-h-48 w-full object-contain"
                    />
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <ImageIcon className="h-3 w-3" />
                      <span className="truncate">{file.name}</span>
                      <span className="ml-auto">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="truncate">{file.name}</span>
                    <span className="ml-auto">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("labs.save_result")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
