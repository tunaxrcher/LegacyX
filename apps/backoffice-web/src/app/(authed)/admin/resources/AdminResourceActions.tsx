"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientApi } from "@/lib/clientApi";

type Resource = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  floor?: number;
  subtype?: string;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "RETIRED";
};

type Mode = null | "edit" | "delete";

export function AdminResourceActions({ resource }: { resource: Resource }) {
  const t = useTranslations("admin_resources");
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);

  const onDone = () => {
    setMode(null);
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{resource.code}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" /> {t("edit")}
          </DropdownMenuItem>
          {resource.status !== "RETIRED" && (
            <DropdownMenuItem
              onClick={() => setMode("delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "edit" && (
        <EditDialog resource={resource} onDone={onDone} onCancel={() => setMode(null)} />
      )}
      {mode === "delete" && (
        <DeleteDialog resource={resource} onDone={onDone} onCancel={() => setMode(null)} />
      )}
    </>
  );
}

function EditDialog({
  resource,
  onDone,
  onCancel,
}: {
  resource: Resource;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_resources");
  const tCommon = useTranslations("common");
  const [name, setName] = React.useState(resource.name);
  const [capacity, setCapacity] = React.useState(String(resource.capacity));
  const [floor, setFloor] = React.useState(
    resource.floor !== undefined ? String(resource.floor) : "",
  );
  const [subtype, setSubtype] = React.useState(resource.subtype ?? "");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/resources/${resource.id}`, {
        name,
        capacity: Number(capacity || 1),
        floor: floor ? Number(floor) : undefined,
        subtype: subtype || undefined,
      });
      toast.success(t("update_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
          <DialogDescription>{resource.code}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="floor">{t("floor")}</Label>
              <Input
                id="floor"
                type="number"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity">{t("capacity")}</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subtype">{t("subtype")}</Label>
            <Input
              id="subtype"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              placeholder="Dental / Spa / VIP / Laser"
            />
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
  );
}

function DeleteDialog({
  resource,
  onDone,
  onCancel,
}: {
  resource: Resource;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin_resources");
  const tCommon = useTranslations("common");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await clientApi.delete(`/api/v1/resources/${resource.id}`);
      toast.success(t("delete_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("delete_title")}</DialogTitle>
          <DialogDescription>
            {t("delete_desc", { code: resource.code, name: resource.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("delete_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
