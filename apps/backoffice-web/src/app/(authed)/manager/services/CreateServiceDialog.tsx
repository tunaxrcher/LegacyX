"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/ui/image-uploader";
import { clientApi } from "@/lib/clientApi";

type CategoryOption = { id: string; name: string; name_th: string };
export type ProcedureOption = {
  code: string;
  name: string;
  default_price: number;
};

/**
 * New service dialog. Form-level UX improvements vs the original:
 *  - `code` is HIDDEN — derived server-side from `name`
 *  - `procedure_code` is a <Select> populated by /api/v1/catalog/procedures
 *  - image is an upload widget (not a URL textbox)
 *  - Picking a procedure auto-fills price + bumps duration to the standard
 */
export function CreateServiceDialog({
  categories,
  procedures,
}: {
  categories: CategoryOption[];
  procedures: ProcedureOption[];
}) {
  const router = useRouter();
  const t = useTranslations("manager_services");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState<string>(categories[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [nameTh, setNameTh] = React.useState("");
  const [descTh, setDescTh] = React.useState("");
  const [priceFrom, setPriceFrom] = React.useState("");
  const [priceTo, setPriceTo] = React.useState("");
  const [duration, setDuration] = React.useState("30");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [procedureCode, setProcedureCode] = React.useState<string>("__none__");
  const [displayOrder, setDisplayOrder] = React.useState("");

  function reset() {
    setName("");
    setNameTh("");
    setDescTh("");
    setPriceFrom("");
    setPriceTo("");
    setDuration("30");
    setImageUrl(null);
    setProcedureCode("__none__");
    setDisplayOrder("");
  }

  function onPickProcedure(code: string) {
    setProcedureCode(code);
    if (code !== "__none__") {
      const p = procedures.find((it) => it.code === code);
      if (p && !priceFrom) setPriceFrom(String(p.default_price || ""));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post("/api/v1/catalog/services", {
        category_id: categoryId,
        // code omitted — server derives from name
        name,
        name_th: nameTh,
        description_th: descTh || undefined,
        price_from: priceFrom === "" ? null : Number(priceFrom),
        price_to: priceTo === "" ? null : Number(priceTo),
        duration_min: Number(duration || 30),
        image_url: imageUrl || undefined,
        procedure_code: procedureCode === "__none__" ? null : procedureCode,
        display_order: displayOrder ? Number(displayOrder) : undefined,
      });
      toast.success(t("svc_create_success"));
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  const disabled = categories.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <Sparkles className="h-4 w-4" />
          {t("new_service")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("new_service")}</DialogTitle>
          <DialogDescription>{t("new_service_desc")}</DialogDescription>
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
            <Label htmlFor="svc_name_th">{t("name_th")} (TH)</Label>
            <Input
              id="svc_name_th"
              value={nameTh}
              onChange={(e) => setNameTh(e.target.value)}
              required
              placeholder="โบท็อกซ์ทั้งใบหน้า"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc_name">{t("name")} (EN)</Label>
            <Input
              id="svc_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Botox Full Face"
            />
            <p className="text-[10px] text-muted-foreground">{t("code_auto_hint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc_desc">{t("description_th")}</Label>
            <Textarea
              id="svc_desc"
              value={descTh}
              onChange={(e) => setDescTh(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proc">
              {t("procedure_code")}{" "}
              <span className="text-[10px] text-muted-foreground">
                ({t("procedure_hint")})
              </span>
            </Label>
            <Select value={procedureCode} onValueChange={onPickProcedure}>
              <SelectTrigger id="proc">
                <SelectValue placeholder={t("procedure_none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— {t("procedure_none")} —</SelectItem>
                {procedures.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}{" "}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ({p.code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf">{t("price_from")}</Label>
              <Input
                id="pf"
                type="number"
                min={0}
                value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt">{t("price_to")}</Label>
              <Input
                id="pt"
                type="number"
                min={0}
                value={priceTo}
                onChange={(e) => setPriceTo(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dur">{t("duration")}</Label>
              <Input
                id="dur"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc_order">{t("order")}</Label>
            <Input
              id="svc_order"
              type="number"
              min={0}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              placeholder="0"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy || !name || !nameTh || !categoryId}>
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
