"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const AI_BASE = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "http://localhost:3002";

function readSession() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )lx_session=([^;]+)/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1] ?? ""));
  } catch {
    return null;
  }
}

export default function IntakeTester() {
  const router = useRouter();
  const t = useTranslations("ai_drafts");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = readSession();
      if (!s) throw new Error("No session");
      const res = await fetch(`${AI_BASE}/ai/intake/summary`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": s.tenantId,
          "x-branch-id": s.branchId,
        },
        body: JSON.stringify({ symptoms: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t("generated_summary"));
      setText("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("decide_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="h-4 w-4" /> {t("test_intake")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("test_intake")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="symptoms">{t("input_text")}</Label>
            <Textarea
              id="symptoms"
              required
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Severe headache and chest pain since morning"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <Sparkles className="h-4 w-4" />
              {t("generate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
