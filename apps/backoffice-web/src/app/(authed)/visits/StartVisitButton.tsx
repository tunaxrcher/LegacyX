"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlayCircle, Loader2, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

type Props = {
  visitId: string;
  /** Pretty label of the room the visit is currently in (if any) */
  currentRoomLabel: string | null;
};

type RoomResource = {
  id: string;
  type: string;
  code: string;
  name: string;
  status: string;
  activeReservation?: { appointmentId: string | null };
};

/**
 * "Send to room" button shown next to OPEN visits on /visits.
 *
 * Behaviour:
 *   - If a room has already been assigned at check-in → call /start directly.
 *   - Otherwise → open a small picker dialog, /assign-room, then /start.
 *
 * This addresses the UX gap reported during testing — RECEPTION used to be
 * stuck if they checked-in without selecting a room.
 */
export function StartVisitButton({ visitId, currentRoomLabel }: Props) {
  const router = useRouter();
  const t = useTranslations("visits");
  const tCommon = useTranslations("common");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [rooms, setRooms] = React.useState<RoomResource[]>([]);
  const [roomId, setRoomId] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    clientApi
      .get<{ data: RoomResource[] }>("/api/v1/resources?type=ROOM")
      .then((r) => setRooms(r.data ?? []))
      .catch(() => setRooms([]));
  }, [open]);

  async function startNow() {
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/visits/${visitId}/start`, {});
      toast.success(t("start_success"));
      router.refresh();
    } catch (err) {
      toast.error(t("check_in_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function assignAndStart(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId) {
      toast.error(t("select_room"));
      return;
    }
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/visits/${visitId}/assign-room`, {
        room_resource_id: roomId,
      });
      await clientApi.post(`/api/v1/visits/${visitId}/start`, {});
      toast.success(t("start_success"));
      setOpen(false);
      setRoomId("");
      router.refresh();
    } catch (err) {
      toast.error(t("check_in_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  // Already in a room — direct start
  if (currentRoomLabel) {
    return (
      <Button size="sm" onClick={startNow} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
        {t("start")}
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={busy}>
        <DoorOpen className="h-4 w-4" />
        {t("start")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("start")}</DialogTitle>
            <DialogDescription>{t("start_room_subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={assignAndStart} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("select_room")}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("select_room")} />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => {
                    const occupied = r.status === "OCCUPIED";
                    const disabled =
                      occupied || r.status === "MAINTENANCE" || r.status === "RETIRED";
                    return (
                      <SelectItem key={r.id} value={r.id} disabled={disabled}>
                        <span className="inline-flex items-center gap-2">
                          <DoorOpen className="h-3.5 w-3.5" />
                          {r.name}{" "}
                          <span className="text-xs text-muted-foreground">({r.code})</span>
                          {occupied && (
                            <span className="text-xs text-warning">· {t("in_use")}</span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
