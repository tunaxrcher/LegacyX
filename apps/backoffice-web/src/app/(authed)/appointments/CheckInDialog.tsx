"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserCheck, Loader2, DoorOpen } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

interface Resource {
  id: string;
  type: string;
  code: string;
  name: string;
  status: string;
  activeReservations?: { id: string }[];
}

interface Props {
  appointmentId: string;
  patientLabel: string;
}

export function CheckInDialog({ appointmentId, patientLabel }: Props) {
  const router = useRouter();
  const t = useTranslations("visits");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [roomId, setRoomId] = React.useState<string>("__none");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    clientApi
      .get<{ data: Resource[] }>("/api/v1/resources?type=ROOM")
      .then((r) => setResources(r.data ?? []))
      .catch(() => setResources([]));
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/visits/check-in", {
        appointment_id: appointmentId,
        room_resource_id: roomId !== "__none" ? roomId : undefined,
        notes: notes || undefined,
      });
      toast.success(t("check_in_success"));
      setOpen(false);
      setRoomId("__none");
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(t("check_in_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <UserCheck className="h-4 w-4" />
          {t("check_in")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("check_in_title")}</DialogTitle>
          <DialogDescription className="font-medium text-foreground">
            {patientLabel}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>
              {t("room")}{" "}
              <span className="text-xs text-muted-foreground">{t("room_optional")}</span>
            </Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue placeholder={t("select_room")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">
                  <span className="text-muted-foreground">— {t("no_room")}</span>
                </SelectItem>
                {resources.map((r) => {
                  const busy = (r.activeReservations?.length ?? 0) > 0;
                  return (
                    <SelectItem key={r.id} value={r.id} disabled={busy || r.status !== "AVAILABLE"}>
                      <span className="inline-flex items-center gap-2">
                        <DoorOpen className="h-3.5 w-3.5" />
                        {r.name} <span className="text-xs text-muted-foreground">({r.code})</span>
                        {busy && <span className="text-xs text-warning">· in use</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              {t("check_in")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
