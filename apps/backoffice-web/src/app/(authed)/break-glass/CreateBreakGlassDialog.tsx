"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldAlert, Loader2, Plus } from "lucide-react";
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

export function CreateBreakGlassDialog() {
  const router = useRouter();
  const t = useTranslations("break_glass");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [actorUserId, setActorUserId] = React.useState("");
  const [resourceType, setResourceType] = React.useState("");
  const [resourceId, setResourceId] = React.useState("");
  const [reason, setReason] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/break-glass", {
        actor_user_id: actorUserId,
        resource_type: resourceType,
        resource_id: resourceId,
        reason,
      });
      toast.success(t("approve_success"));
      setOpen(false);
      setActorUserId("");
      setResourceType("");
      setResourceId("");
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          {t("new_override")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new_override")}</DialogTitle>
          <DialogDescription>{t("new_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="actor">{t("actor_user_id")}</Label>
            <Input
              id="actor"
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              required
              placeholder="user id of the junior staff"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rt">{t("resource_type")}</Label>
              <Input
                id="rt"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                required
                placeholder="Patient / Invoice / EMR"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rid">{t("resource_id")}</Label>
              <Input
                id="rid"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">{t("reason")}</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={10}
              placeholder="ระบุเหตุผลทางคลินิก/การเงิน อย่างน้อย 10 ตัวอักษร"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || reason.length < 10}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("approve")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
