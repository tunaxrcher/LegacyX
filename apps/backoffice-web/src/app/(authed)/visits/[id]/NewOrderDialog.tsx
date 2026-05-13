"use client";

/**
 * Cart-style order builder. Replaces the old per-row grid form.
 *
 * UX rules:
 *   - A single catalog picker sits at the top; picking an item appends a new
 *     line below. No type dropdown — the picker already knows the item type.
 *   - Each line is a self-contained card: icon, name, code, qty stepper,
 *     editable unit price, computed total, remove button.
 *   - Notes collapse to save vertical space.
 *   - Running subtotal with item count in the submit button for quick scan.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Trash2,
  Syringe,
  Pill,
  Package,
  Gift,
  Minus,
  StickyNote,
  ChevronDown,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { clientApi } from "@/lib/clientApi";
import { CatalogPicker, type CatalogItem } from "@/components/catalog/CatalogPicker";
import { cn } from "@/lib/utils";

type ItemType = "PROCEDURE" | "PRODUCT" | "MEDICATION" | "COURSE";

interface Line {
  key: string; // stable local id for react keys
  itemType: ItemType;
  refId: string;
  code: string;
  name: string;
  unit?: string;
  qty: number;
  unitPrice: number;
}

const TYPE_META: Record<
  ItemType,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  PROCEDURE: { icon: Syringe, color: "text-rose-600", label: "Procedure" },
  MEDICATION: { icon: Pill, color: "text-emerald-600", label: "Medication" },
  PRODUCT: { icon: Package, color: "text-amber-600", label: "Product" },
  COURSE: { icon: Gift, color: "text-violet-600", label: "Course" },
};

let keyCounter = 0;
const nextKey = () => `ln_${Date.now()}_${keyCounter++}`;

export function NewOrderDialog({ visitId }: { visitId: string }) {
  const router = useRouter();
  const t = useTranslations("orders");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [notes, setNotes] = React.useState("");
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [pickerValue, setPickerValue] = React.useState<string | undefined>();

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  function addFromPicker(picked: CatalogItem) {
    // If already in the cart, bump qty instead of duplicating.
    setLines((prev) => {
      const existing = prev.find((l) => l.refId === picked.refId);
      if (existing) {
        return prev.map((l) =>
          l.refId === picked.refId ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: nextKey(),
          itemType: picked.itemType,
          refId: picked.refId,
          code: picked.code,
          name: picked.name,
          unit: picked.unit ?? undefined,
          qty: 1,
          unitPrice: Number(picked.defaultPrice ?? 0),
        },
      ];
    });
    // Clear picker selection so the trigger label resets.
    setPickerValue(undefined);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error(t("empty_cart") ?? "Please add at least one item");
      return;
    }
    if (lines.some((l) => l.qty <= 0)) {
      toast.error(t("bad_qty") ?? "Every item needs a quantity above zero");
      return;
    }
    setBusy(true);
    try {
      await clientApi.post("/api/v1/orders", {
        visit_id: visitId,
        notes: notes || undefined,
        items: lines.map((l) => ({
          item_type: l.itemType,
          ref_id: l.refId,
          description: l.name,
          qty: String(l.qty),
          unit_price: String(l.unitPrice),
        })),
      });
      toast.success(t("create_success"));
      setOpen(false);
      setLines([]);
      setNotes("");
      setNotesOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("create_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("new_desc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Catalog picker — always visible, appends to cart */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("add_to_order") ?? "Add to order"}
            </Label>
            <CatalogPicker
              value={pickerValue}
              onSelect={addFromPicker}
              placeholder={t("pick_item") ?? "Search procedures, medications, courses…"}
            />
          </div>

          {/* Cart lines */}
          {lines.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/20 py-10 text-center text-sm text-muted-foreground">
              {t("cart_empty") ?? "No items yet. Use the search above to add one."}
            </div>
          ) : (
            <ul className="space-y-2">
              {lines.map((l) => (
                <LineRow
                  key={l.key}
                  line={l}
                  onChange={(patch) => updateLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </ul>
          )}

          {/* Notes — collapsed by default to keep the form compact */}
          <div>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <StickyNote className="h-3.5 w-3.5" />
              {tCommon("notes") ?? "Notes"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", notesOpen && "rotate-180")}
              />
            </button>
            {notesOpen && (
              <Textarea
                className="mt-2"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notes_placeholder") ?? "e.g. Patient requests morning appointment"}
              />
            )}
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <div className="text-sm">
              <span className="font-medium">{t("subtotal") ?? "Subtotal"}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {lines.length} {t("items") ?? "items"}
              </span>
            </div>
            <div className="text-lg font-semibold tabular-nums">
              ฿ {subtotal.toLocaleString()}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy || lines.length === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("create")}
              {lines.length > 0 && (
                <span className="ml-1 tabular-nums">· ฿{subtotal.toLocaleString()}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A single cart line. Kept as its own component to localize state updates. */
function LineRow({
  line,
  onChange,
  onRemove,
}: {
  line: Line;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const meta = TYPE_META[line.itemType];
  const Icon = meta.icon;
  const lineTotal = line.qty * line.unitPrice;

  return (
    <li className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 rounded-md bg-muted p-2", meta.color)}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{line.name}</div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {meta.label}
                </Badge>
                <span className="font-mono">{line.code}</span>
                {line.unit && <span>· {line.unit}</span>}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Qty stepper */}
            <div className="inline-flex items-center rounded-md border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => onChange({ qty: Math.max(1, line.qty - 1) })}
                disabled={line.qty <= 1}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <input
                type="number"
                min="1"
                step="1"
                value={line.qty}
                onChange={(e) => onChange({ qty: Number(e.target.value) || 1 })}
                className="h-8 w-12 border-x bg-transparent text-center text-sm tabular-nums outline-none"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => onChange({ qty: line.qty + 1 })}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Unit price (editable for discount / override) */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              @
              <Input
                type="number"
                min="0"
                step="1"
                value={line.unitPrice}
                onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })}
                className="h-8 w-24 text-right text-sm tabular-nums"
              />
            </div>

            {/* Line total */}
            <div className="ml-auto text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Total
              </div>
              <div className="text-sm font-semibold tabular-nums">
                ฿ {lineTotal.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
