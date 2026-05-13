"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

const TYPES = ["ROOM", "MACHINE", "LASER", "THERAPIST", "OTHER"] as const;

export function CreateResourceDialog() {
  const router = useRouter();
  const t = useTranslations("resources");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [type, setType] = React.useState<(typeof TYPES)[number]>("ROOM");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [floor, setFloor] = React.useState<string>("3");
  const [subtype, setSubtype] = React.useState("");
  const [capacity, setCapacity] = React.useState("1");

  function reset() {
    setType("ROOM");
    setCode("");
    setName("");
    setFloor("3");
    setSubtype("");
    setCapacity("1");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/resources", {
        type,
        code,
        name,
        capacity: Number(capacity || 1),
        floor: floor ? Number(floor) : undefined,
        subtype: subtype || undefined,
      });
      toast.success(t("create_success"));
      setOpen(false);
      reset();
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
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("new_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">{t("type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as (typeof TYPES)[number])}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {tp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">{t("code")}</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                placeholder="ROOM-306"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor">{t("floor_label")}</Label>
              <Input
                id="floor"
                type="number"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="ห้อง 306"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subtype">{t("subtype")}</Label>
            <Input
              id="subtype"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              placeholder="Dental Room / Spa / VIP / Laser"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy || !code || !name}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
