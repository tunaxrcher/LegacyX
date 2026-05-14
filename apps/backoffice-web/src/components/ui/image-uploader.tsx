"use client";

import * as React from "react";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/clientApi";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Endpoint that accepts multipart/form-data with `file` field. */
  uploadUrl: string;
  /** Optional aspect-ratio class (default: square). */
  aspect?: string;
  /** Optional label */
  label?: string;
};

/**
 * Image upload widget: click to pick → uploads to `uploadUrl` → stores the
 * returned public URL via `onChange`. Replaces the old URL-typing UX so admins
 * don't have to host images themselves.
 *
 * The endpoint must respond with `{ data: { url: string } }`.
 */
export function ImageUploader({
  value,
  onChange,
  uploadUrl,
  aspect = "aspect-[16/10]",
  label,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const json = await clientApi.upload<{ url: string }>(uploadUrl, form);
      onChange(json.url);
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {label ? (
        <label className="text-sm font-medium leading-none">{label}</label>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />

      {value ? (
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border bg-muted",
            aspect,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow"
              onClick={openPicker}
              disabled={busy}
              title="Replace"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-8 w-8 shadow"
              onClick={() => onChange(null)}
              disabled={busy}
              title="Remove"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className={cn(
            "group w-full rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed",
            aspect,
          )}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <ImageIcon className="h-6 w-6 group-hover:scale-110 transition" />
              <span className="text-xs font-medium">
                คลิกเพื่ออัปโหลดรูปภาพ
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                JPEG · PNG · WebP · GIF · ≤ 5 MB
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
