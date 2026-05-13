"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X, FilePen, Eye, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";

export interface DraftSummary {
  id: string;
  type: string;
  status: string;
  modelName: string;
  modelVersion: string;
  draft: unknown;
  createdAt: string;
}

export function DraftDetailSheet({ draft }: { draft: DraftSummary }) {
  const router = useRouter();
  const t = useTranslations("ai_drafts");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const isPending = draft.status === "PENDING";

  async function decide(action: "APPROVE" | "REJECT" | "EDIT_AND_APPROVE") {
    setBusy(action);
    try {
      await clientApi.post(`/api/v1/ai/drafts/${draft.id}/decide`, {
        action,
        notes: notes || undefined,
      });
      toast.success(action === "REJECT" ? t("reject_success") : t("approve_success"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("decide_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="h-4 w-4" /> {tCommon("details")}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <SheetTitle>{draft.type.replace(/_/g, " ")}</SheetTitle>
            <DraftStatusBadge status={draft.status} />
          </div>
          <SheetDescription className="font-mono text-xs">
            {draft.modelName}@{draft.modelVersion} · {formatDateTime(draft.createdAt)}
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Draft content
            </h4>
            <pre className="max-h-[280px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              {JSON.stringify(draft.draft, null, 2)}
            </pre>
          </div>

          {isPending && (
            <div className="space-y-2">
              <Label htmlFor="notes">Reviewer notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for audit log"
              />
            </div>
          )}
        </div>

        {isPending && (
          <SheetFooter className="border-t pt-4">
            <Button
              variant="destructive"
              onClick={() => decide("REJECT")}
              disabled={!!busy}
              className="flex-1"
            >
              {busy === "REJECT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {tCommon("reject")}
            </Button>
            <Button
              variant="outline"
              onClick={() => decide("EDIT_AND_APPROVE")}
              disabled={!!busy}
              className="flex-1"
            >
              {busy === "EDIT_AND_APPROVE" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FilePen className="h-4 w-4" />
              )}
              Edit & Approve
            </Button>
            <Button onClick={() => decide("APPROVE")} disabled={!!busy} className="flex-1">
              {busy === "APPROVE" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {tCommon("approve")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function DraftStatusBadge({ status }: { status: string }) {
  const variant: Record<string, "warning" | "success" | "destructive" | "muted"> = {
    PENDING: "warning",
    APPROVED: "success",
    EDITED: "success",
    REJECTED: "destructive",
  };
  return <Badge variant={variant[status] ?? "muted"}>{status}</Badge>;
}
