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
import { ImageUploader } from "@/components/ui/image-uploader";
import { clientApi } from "@/lib/clientApi";

export type Category = {
  id: string;
  code: string;
  name: string;
  name_th: string;
  description: string | null;
  description_th: string | null;
  image_url: string | null;
  display_order: number;
  active: boolean;
  service_count: number;
};

type Mode = null | "edit" | "delete" | "toggle";

export function CategoryActions({ category }: { category: Category }) {
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
          <DropdownMenuLabel>{category.code}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" /> {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("toggle")}>
            <Power className="h-4 w-4" />
            {category.active ? t("disable") : t("enable")}
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
        <EditCategoryDialog category={category} onDone={onDone} onCancel={() => setMode(null)} />
      )}
      {mode === "delete" && (
        <DeleteCategoryDialog category={category} onDone={onDone} onCancel={() => setMode(null)} />
      )}
      {mode === "toggle" && (
        <ToggleActiveDialog category={category} onDone={onDone} onCancel={() => setMode(null)} />
      )}
    </>
  );
}

function EditCategoryDialog({
  category,
  onDone,
  onCancel,
}: {
  category: Category;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("manager_services");
  const tCommon = useTranslations("common");
  const [name, setName] = React.useState(category.name);
  const [nameTh, setNameTh] = React.useState(category.name_th);
  const [descTh, setDescTh] = React.useState(category.description_th ?? "");
  const [imageUrl, setImageUrl] = React.useState<string | null>(category.image_url ?? null);
  const [displayOrder, setDisplayOrder] = React.useState(String(category.display_order));
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/catalog/service-categories/${category.id}`, {
        name,
        name_th: nameTh,
        description_th: descTh,
        image_url: imageUrl || null,
        display_order: Number(displayOrder || 0),
      });
      toast.success(t("cat_update_success"));
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
          <DialogTitle>{t("edit_category")}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{category.code}</span>
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
            <Label htmlFor="name_th">{t("name_th")} (TH)</Label>
            <Input id="name_th" value={nameTh} onChange={(e) => setNameTh(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")} (EN)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc_th">{t("description_th")}</Label>
            <Textarea id="desc_th" value={descTh} onChange={(e) => setDescTh(e.target.value)} rows={2} />
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

function ToggleActiveDialog({
  category,
  onDone,
  onCancel,
}: {
  category: Category;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("manager_services");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/catalog/service-categories/${category.id}`, {
        active: !category.active,
      });
      toast.success(t("cat_update_success"));
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
            {category.active ? t("disable_title") : t("enable_title")}
          </DialogTitle>
          <DialogDescription>
            {category.active
              ? t("disable_desc", { name: category.name_th })
              : t("enable_desc", { name: category.name_th })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {category.active ? t("disable") : t("enable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({
  category,
  onDone,
  onCancel,
}: {
  category: Category;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("manager_services");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await clientApi.delete(`/api/v1/catalog/service-categories/${category.id}`);
      toast.success(t("cat_delete_success"));
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
          <DialogTitle>{t("delete_category_title")}</DialogTitle>
          <DialogDescription>
            {category.service_count > 0
              ? t("delete_category_blocked", {
                  count: category.service_count,
                })
              : t("delete_category_confirm", { name: category.name_th })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy || category.service_count > 0}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
