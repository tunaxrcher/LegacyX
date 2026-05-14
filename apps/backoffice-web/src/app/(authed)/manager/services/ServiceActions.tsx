"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/ui/image-uploader";
import { clientApi } from "@/lib/clientApi";
import type { ProcedureOption } from "./CreateServiceDialog";

type CategoryOption = { id: string; name: string; name_th: string };
type Service = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_min: number;
  image_url: string | null;
  procedure_code: string | null;
  display_order: number;
  active: boolean;
};

type Mode = null | "edit" | "delete" | "toggle";

export function ServiceActions({
  service,
  categories,
  procedures,
}: {
  service: Service;
  categories: CategoryOption[];
  procedures: ProcedureOption[];
}) {
  const t = useTranslations("manager_services");
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
          <DropdownMenuLabel>{service.code}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" /> {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("toggle")}>
            <Power className="h-4 w-4" />
            {service.active ? t("disable") : t("enable")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setMode("delete")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "edit" && (
        <EditServiceDialog
          service={service}
          categories={categories}
          procedures={procedures}
          onDone={onDone}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === "delete" && (
        <DeleteServiceDialog service={service} onDone={onDone} onCancel={() => setMode(null)} />
      )}
      {mode === "toggle" && (
        <ToggleServiceDialog service={service} onDone={onDone} onCancel={() => setMode(null)} />
      )}
    </>
  );
}

function EditServiceDialog({
  service,
  categories,
  procedures,
  onDone,
  onCancel,
}: {
  service: Service;
  categories: CategoryOption[];
  procedures: ProcedureOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("manager_services");
  const tCommon = useTranslations("common");
  const [categoryId, setCategoryId] = React.useState(service.category_id);
  const [name, setName] = React.useState(service.name);
  const [nameTh, setNameTh] = React.useState(service.name_th);
  const [descTh, setDescTh] = React.useState(service.description_th ?? "");
  const [priceFrom, setPriceFrom] = React.useState(
    service.price_from === null ? "" : String(service.price_from),
  );
  const [priceTo, setPriceTo] = React.useState(
    service.price_to === null ? "" : String(service.price_to),
  );
  const [duration, setDuration] = React.useState(String(service.duration_min));
  const [imageUrl, setImageUrl] = React.useState<string | null>(service.image_url ?? null);
  const [procedureCode, setProcedureCode] = React.useState<string>(
    service.procedure_code ?? "__none__",
  );
  const [displayOrder, setDisplayOrder] = React.useState(String(service.display_order));
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/catalog/services/${service.id}`, {
        category_id: categoryId,
        name,
        name_th: nameTh,
        description_th: descTh,
        price_from: priceFrom === "" ? null : Number(priceFrom),
        price_to: priceTo === "" ? null : Number(priceTo),
        duration_min: Number(duration || 30),
        image_url: imageUrl || null,
        procedure_code: procedureCode === "__none__" ? null : procedureCode,
        display_order: Number(displayOrder || 0),
      });
      toast.success(t("svc_update_success"));
      onDone();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("edit_service")}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{service.code}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <ImageUploader
            label={t("image_url")}
            value={imageUrl}
            onChange={setImageUrl}
            uploadUrl="/api/v1/uploads/service-image"
            aspect="aspect-[16/9]"
          />

          <div className="space-y-1.5">
            <Label htmlFor="cat">{t("category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name_th} ({c.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name_th">{t("name_th")} (TH)</Label>
            <Input id="name_th" value={nameTh} onChange={(e) => setNameTh(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")} (EN)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">{t("description_th")}</Label>
            <Textarea id="desc" value={descTh} onChange={(e) => setDescTh(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proc">{t("procedure_code")}</Label>
            <Select value={procedureCode} onValueChange={setProcedureCode}>
              <SelectTrigger id="proc">
                <SelectValue placeholder={t("procedure_none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— {t("procedure_none")} —</SelectItem>
                {procedures.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf">{t("price_from")}</Label>
              <Input id="pf" type="number" min={0} value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt">{t("price_to")}</Label>
              <Input id="pt" type="number" min={0} value={priceTo} onChange={(e) => setPriceTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dur">{t("duration")}</Label>
              <Input id="dur" type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ord">{t("order")}</Label>
            <Input
              id="ord"
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
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

function ToggleServiceDialog({
  service,
  onDone,
  onCancel,
}: {
  service: Service;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("manager_services");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/catalog/services/${service.id}`, {
        active: !service.active,
      });
      toast.success(t("svc_update_success"));
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
          <DialogTitle>
            {service.active ? t("disable_title") : t("enable_title")}
          </DialogTitle>
          <DialogDescription>
            {service.active
              ? t("disable_desc", { name: service.name_th })
              : t("enable_desc", { name: service.name_th })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {service.active ? t("disable") : t("enable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteServiceDialog({
  service,
  onDone,
  onCancel,
}: {
  service: Service;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("manager_services");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await clientApi.delete(`/api/v1/catalog/services/${service.id}`);
      toast.success(t("svc_delete_success"));
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
          <DialogTitle>{t("delete_service_title")}</DialogTitle>
          <DialogDescription>
            {t("delete_service_confirm", { name: service.name_th })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
