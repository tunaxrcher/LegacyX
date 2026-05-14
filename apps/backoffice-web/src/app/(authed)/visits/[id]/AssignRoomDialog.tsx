"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DoorOpen, ArrowRightLeft, Loader2 } from "lucide-react";
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
  activeReservation?: { appointmentId: string | null };
}

interface Props {
  visitId: string;
  /** id of the room currently assigned to this visit, if any */
  currentRoomId: string | null;
  /** Reservation appointmentId so we can recognise "this room is mine" */
  appointmentId: string | null;
  /** Pretty label for the current room ("Room 301 — Dental") */
  currentRoomLabel: string | null;
}

export function AssignRoomDialog({
  visitId,
  currentRoomId,
  appointmentId,
  currentRoomLabel,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("visits");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);

  // Auto-open when navigated with ?action=transfer (from /resources card)
  React.useEffect(() => {
    if (searchParams?.get("action") === "transfer") {
      setOpen(true);
    }
  }, [searchParams]);
  const [busy, setBusy] = React.useState(false);
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [roomId, setRoomId] = React.useState<string>("");
  const [reason, setReason] = React.useState("");

  const isTransfer = !!currentRoomId;

  React.useEffect(() => {
    if (!open) return;
    clientApi
      .get<{ data: Resource[] }>("/api/v1/resources?type=ROOM")
      .then((r) => setResources(r.data ?? []))
      .catch(() => setResources([]));
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId) {
      toast.error(t("select_room"));
      return;
    }
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/visits/${visitId}/assign-room`, {
        room_resource_id: roomId,
        reason: reason || undefined,
      });
      toast.success(
        isTransfer ? t("transfer_room_success") : t("assign_room_success"),
      );
      setOpen(false);
      setRoomId("");
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(
        isTransfer ? t("transfer_room_failed") : t("assign_room_failed"),
        { description: err instanceof Error ? err.message : String(err) },
      );
    } finally {
      setBusy(false);
    }
  }

  const triggerLabel = isTransfer ? t("transfer_room") : t("assign_room");
  const TriggerIcon = isTransfer ? ArrowRightLeft : DoorOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isTransfer ? "outline" : "default"} size="sm">
          <TriggerIcon className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
          <DialogDescription>
            {isTransfer
              ? t("transfer_room_subtitle", { current: currentRoomLabel ?? "—" })
              : t("assign_room_subtitle")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("select_room")}</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue placeholder={t("select_room")} />
              </SelectTrigger>
              <SelectContent>
                {resources.map((r) => {
                  const mine =
                    !!appointmentId &&
                    r.activeReservation?.appointmentId === appointmentId;
                  const occupied =
                    r.status === "OCCUPIED" && !mine;
                  const disabled =
                    occupied ||
                    r.status === "MAINTENANCE" ||
                    r.status === "RETIRED";
                  return (
                    <SelectItem
                      key={r.id}
                      value={r.id}
                      disabled={disabled || r.id === currentRoomId}
                    >
                      <span className="inline-flex items-center gap-2">
                        <DoorOpen className="h-3.5 w-3.5" />
                        {r.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({r.code})
                        </span>
                        {r.id === currentRoomId && (
                          <span className="text-xs text-muted-foreground">
                            · {t("current_room")}
                          </span>
                        )}
                        {occupied && (
                          <span className="text-xs text-warning">
                            · {t("in_use")}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {isTransfer && (
            <div className="space-y-2">
              <Label htmlFor="reason">{t("transfer_reason")}</Label>
              <Textarea
                id="reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("transfer_reason_placeholder")}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
