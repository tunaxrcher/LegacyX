"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DoorOpen,
  Wrench,
  Loader2,
  Check,
  CircleDot,
  Stethoscope,
  ArrowRightLeft,
  ExternalLink,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/clientApi";

export type ResourceRow = {
  id: string;
  type: "ROOM" | "MACHINE" | "THERAPIST" | "LASER" | "OTHER";
  code: string;
  name: string;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "RETIRED";
  rawStatus: string;
  attributes: { floor?: number; subtype?: string } | null;
  activeReservation: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    appointmentId: string | null;
    occupant: { name: string; hn: string } | null;
    doctor: { id: string; name: string | null } | null;
    visit: { id: string; status: string } | null;
  } | null;
};

const STATUS_COLOUR: Record<ResourceRow["status"], string> = {
  AVAILABLE: "bg-success",
  OCCUPIED: "bg-info",
  MAINTENANCE: "bg-warning",
  RETIRED: "bg-muted-foreground",
};

const CARD_BG: Record<ResourceRow["status"], string> = {
  AVAILABLE: "border-success/30 bg-success/5",
  OCCUPIED: "border-info/30 bg-info/5",
  MAINTENANCE: "border-warning/40 bg-warning/5",
  RETIRED: "border-muted bg-muted/20 opacity-70",
};

export function ResourceCard({ resource }: { resource: ResourceRow }) {
  const t = useTranslations("resources");
  const router = useRouter();
  const [releasing, setReleasing] = React.useState(false);

  async function release(reason?: string) {
    setReleasing(true);
    try {
      await clientApi.post(`/api/v1/resources/${resource.id}/release`, {
        reason: reason || undefined,
      });
      toast.success(t("release_success"));
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setReleasing(false);
    }
  }

  const occupant = resource.activeReservation?.occupant;
  const doctor = resource.activeReservation?.doctor;
  const visit = resource.activeReservation?.visit;
  const subtype = resource.attributes?.subtype ?? resource.type;

  // Transfer is only meaningful while the visit is still active. Backend
  // (`assignRoom`) blocks COMPLETED/CANCELLED with a 409, so we mirror that
  // policy in the UI to prevent confusing failure dialogs.
  const visitInactive =
    visit?.status === "COMPLETED" || visit?.status === "CANCELLED";
  const transferDisabledReason = visitInactive
    ? t(`transfer_blocked_${visit?.status?.toLowerCase()}` as never)
    : null;

  return (
    <div className={`rounded-lg border p-4 transition-all ${CARD_BG[resource.status]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-base font-bold">{resource.name}</div>
          <div className="text-xs text-muted-foreground">{subtype}</div>
        </div>
        <span
          className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLOUR[resource.status]}`}
          title={resource.status}
        />
      </div>

      <div className="mt-3 text-sm">
        {occupant ? (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{occupant.name}</div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {occupant.hn} · {t("in_use")}
            </div>
            {doctor?.name && (
              <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                <Stethoscope className="h-3 w-3" />
                {doctor.name}
              </div>
            )}
          </div>
        ) : resource.status === "MAINTENANCE" ? (
          <div className="flex items-center gap-1.5 text-xs italic text-warning">
            <Wrench className="h-3.5 w-3.5" />
            {t("maintenance")}
          </div>
        ) : resource.status === "RETIRED" ? (
          <div className="text-xs italic text-muted-foreground">{t("retired")}</div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs italic text-success">
            <Check className="h-3.5 w-3.5" />
            {t("available")}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 border-t pt-3">
        {resource.status === "OCCUPIED" && resource.activeReservation ? (
          <>
            {visit && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full justify-center"
              >
                <Link href={`/visits/${visit.id}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("open_visit")}
                </Link>
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {visit &&
                (visitInactive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-center"
                    disabled
                    title={transferDisabledReason ?? undefined}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {t("transfer")}
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-center"
                  >
                    <Link href={`/visits/${visit.id}?action=transfer`}>
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      {t("transfer")}
                    </Link>
                  </Button>
                ))}
              <ReleaseDialog
                onConfirm={release}
                busy={releasing}
                fullWidth={!visit}
              />
            </div>
            {transferDisabledReason && (
              <p className="-mt-1 text-[11px] italic text-muted-foreground">
                {transferDisabledReason}
              </p>
            )}
          </>
        ) : resource.status === "AVAILABLE" ? (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <CircleDot className="h-3 w-3" />
            <span className="font-mono">{resource.code}</span>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-muted-foreground">{resource.code}</div>
        )}
      </div>
    </div>
  );
}

function ReleaseDialog({
  onConfirm,
  busy,
  fullWidth,
}: {
  onConfirm: (reason?: string) => Promise<void>;
  busy: boolean;
  fullWidth?: boolean;
}) {
  const t = useTranslations("resources");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onConfirm(reason);
    setOpen(false);
    setReason("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={fullWidth ? "w-full justify-center" : "justify-center"}
          disabled={busy}
        >
          <DoorOpen className="h-3.5 w-3.5" />
          {t("release")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("release")}</DialogTitle>
          <DialogDescription>{t("release_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reason">{t("release_reason")}</Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("release_reason_placeholder")}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("release")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
