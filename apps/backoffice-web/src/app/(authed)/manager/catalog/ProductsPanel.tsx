"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Package,
  Syringe,
  Gift,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientApi } from "@/lib/clientApi";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: "MEDICATION" | "SUPPLY" | "DEVICE" | "COSMETIC" | "COURSE" | "OTHER";
  unit: string;
  trackStock: boolean;
  reorderLevel?: number;
  attributes: {
    price?: number;
    sessions?: number;
    procedureCode?: string;
  } | null;
}

const CATEGORIES = [
  { value: "MEDICATION", label: "Medication", icon: Syringe, color: "text-emerald-600" },
  { value: "SUPPLY", label: "Supply", icon: Package, color: "text-amber-600" },
  { value: "DEVICE", label: "Device", icon: Package, color: "text-slate-600" },
  { value: "COSMETIC", label: "Cosmetic", icon: Sparkles, color: "text-rose-600" },
  { value: "COURSE", label: "Course", icon: Gift, color: "text-violet-600" },
  { value: "OTHER", label: "Other", icon: Package, color: "text-zinc-600" },
] as const;

const CAT_META = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

export function ProductsPanel({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter();
  const t = useTranslations("manager_catalog");
  const [products] = React.useState(initialProducts);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>("ALL");

  const filtered = products.filter((p) => {
    if (category !== "ALL" && p.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search_placeholder") ?? "Search by SKU or name…"}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("all_categories") ?? "All categories"}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ProductDialog
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" />
                {t("new_product") ?? "New product"}
              </Button>
            }
            onSaved={() => router.refresh()}
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>{t("col_name") ?? "Name"}</TableHead>
              <TableHead>{t("col_category") ?? "Category"}</TableHead>
              <TableHead>{t("col_unit") ?? "Unit"}</TableHead>
              <TableHead className="text-right">{t("col_price") ?? "Price"}</TableHead>
              <TableHead className="text-right">{t("col_reorder") ?? "Reorder"}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {t("empty") ?? "No products"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const meta = CAT_META[p.category];
                const Icon = meta?.icon ?? Package;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${meta?.color ?? ""}`} />
                        <span className="font-medium">{p.name}</span>
                      </div>
                      {p.attributes?.sessions && (
                        <div className="text-[11px] text-muted-foreground">
                          {p.attributes.sessions} sessions · linked to {p.attributes.procedureCode ?? "—"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{meta?.label ?? p.category}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ฿ {(p.attributes?.price ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {p.reorderLevel ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <ProductDialog
                        product={p}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                        onSaved={() => router.refresh()}
                      />
                      <DeleteButton product={p} onDeleted={() => router.refresh()} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProductDialog({
  product,
  trigger,
  onSaved,
}: {
  product?: Product;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const t = useTranslations("manager_catalog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    category: product?.category ?? "MEDICATION",
    unit: product?.unit ?? "pcs",
    price: product?.attributes?.price ?? 0,
    reorder_level: product?.reorderLevel ?? 0,
    sessions: product?.attributes?.sessions ?? 0,
    procedure_code: product?.attributes?.procedureCode ?? "",
  });
  const isCourse = form.category === "COURSE";
  const isEdit = !!product;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        sku: form.sku,
        name: form.name,
        category: form.category,
        unit: form.unit,
        price: Number(form.price) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        ...(isCourse
          ? {
              sessions: Number(form.sessions) || undefined,
              procedure_code: form.procedure_code || undefined,
            }
          : {}),
      };
      if (isEdit) {
        await clientApi.patch(`/api/v1/catalog/products/${product!.id}`, body);
      } else {
        await clientApi.post("/api/v1/catalog/products", body);
      }
      toast.success(isEdit ? t("saved") ?? "Saved" : t("created") ?? "Created");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(isEdit ? t("save_failed") ?? "Save failed" : t("create_failed") ?? "Create failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("edit_product") ?? "Edit product" : t("new_product") ?? "New product"}
          </DialogTitle>
          <DialogDescription>
            {t("product_dialog_desc") ?? "Medications, supplies, courses — all live here."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU">
              <Input
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="BTX-100U"
                className="font-mono"
              />
            </Field>
            <Field label={t("col_category") ?? "Category"}>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as Product["category"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t("col_name") ?? "Name"}>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("col_unit") ?? "Unit"}>
              <Input
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </Field>
            <Field label={t("col_price") ?? "Price (฿)"}>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </Field>
            <Field label={t("col_reorder") ?? "Reorder"}>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
              />
            </Field>
          </div>
          {isCourse && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
              <Field label={t("sessions") ?? "Sessions"}>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.sessions}
                  onChange={(e) => setForm({ ...form, sessions: Number(e.target.value) })}
                />
              </Field>
              <Field label={t("linked_procedure") ?? "Linked procedure code"}>
                <Input
                  value={form.procedure_code}
                  onChange={(e) => setForm({ ...form, procedure_code: e.target.value })}
                  placeholder="PROC_BTX_FACE"
                  className="font-mono"
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? tCommon("save") ?? "Save" : tCommon("create") ?? "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function DeleteButton({ product, onDeleted }: { product: Product; onDeleted: () => void }) {
  const t = useTranslations("manager_catalog");
  const [busy, setBusy] = React.useState(false);

  async function del() {
    if (!confirm(t("confirm_delete") ?? `Delete ${product.name}?`)) return;
    setBusy(true);
    try {
      await clientApi.delete(`/api/v1/catalog/products/${product.id}`);
      toast.success(t("deleted") ?? "Deleted");
      onDeleted();
    } catch (err) {
      toast.error(t("delete_failed") ?? "Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-destructive"
      onClick={del}
      disabled={busy}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}
