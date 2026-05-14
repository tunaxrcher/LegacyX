"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LayoutGrid, Loader2, Plus } from "lucide-react";
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
import { ImageUploader } from "@/components/ui/image-uploader";
import { clientApi } from "@/lib/clientApi";

/**
 * New category dialog. The internal `code` (slug) is auto-generated server-side
 * from `name` — the form deliberately doesn't expose it (admins shouldn't
 * invent codes). Image is uploaded to S3/DO Spaces via /api/v1/uploads/service-image.
 */
export function CreateCategoryDialog() {
  const router = useRouter();
  const t = useTranslations("manager_services");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [nameTh, setNameTh] = React.useState("");
  const [descTh, setDescTh] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = React.useState("");

  function reset() {
    setName("");
    setNameTh("");
    setDescTh("");
    setImageUrl(null);
    setDisplayOrder("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/catalog/service-categories", {
        name,
        name_th: nameTh,
        description_th: descTh || undefined,
        image_url: imageUrl || undefined,
        display_order: displayOrder ? Number(displayOrder) : undefined,
      });
      toast.success(t("cat_create_success"));
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
        <Button size="sm" variant="outline">
          <LayoutGrid className="h-4 w-4" />
          {t("new_category")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("new_category")}</DialogTitle>
          <DialogDescription>{t("new_category_desc")}</DialogDescription>
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
            <Label htmlFor="cat_name_th">{t("name_th")} (TH)</Label>
            <Input
              id="cat_name_th"
              value={nameTh}
              onChange={(e) => setNameTh(e.target.value)}
              required
              placeholder="ทันตกรรม"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat_name">{t("name")} (EN)</Label>
            <Input
              id="cat_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Dental"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("code_auto_hint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat_desc">{t("description_th")}</Label>
            <Textarea
              id="cat_desc"
              value={descTh}
              onChange={(e) => setDescTh(e.target.value)}
              placeholder="ศูนย์ทันตกรรมเฉพาะทาง"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat_order">{t("order")}</Label>
            <Input
              id="cat_order"
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              placeholder="0"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy || !name || !nameTh}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("save")}
              <Plus className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
