"use client";

/**
 * Client-side filtering for the inventory balance table. Adds:
 *   - search (SKU / name)
 *   - category filter chips
 *   - sort (balance ASC/DESC, name)
 *   - a visual stock-level bar showing balance vs reorder level
 */
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Search,
  Package,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  TrendingDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface StockRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number;
  balance: string;
  lastMovementAt: string | null;
}

const CATEGORIES = [
  { value: "ALL", label: "All", color: "bg-muted" },
  { value: "MEDICATION", label: "Meds", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { value: "SUPPLY", label: "Supply", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "COSMETIC", label: "Cosmetic", color: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  { value: "DEVICE", label: "Device", color: "bg-slate-500/10 text-slate-700 dark:text-slate-400" },
  { value: "OTHER", label: "Other", color: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400" },
] as const;

type SortKey = "name" | "balance_asc" | "balance_desc";

export function InventoryList({ rows }: { rows: StockRow[] }) {
  const t = useTranslations("inventory");
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("ALL");
  const [showLowOnly, setShowLowOnly] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("name");

  const filtered = React.useMemo(() => {
    let list = rows;
    if (category !== "ALL") list = list.filter((r) => r.category === category);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.sku.toLowerCase().includes(needle),
      );
    }
    if (showLowOnly) {
      list = list.filter((r) => Number(r.balance) <= r.reorderLevel && r.reorderLevel > 0);
    }
    const sorted = [...list];
    if (sort === "balance_asc") {
      sorted.sort((a, b) => Number(a.balance) - Number(b.balance));
    } else if (sort === "balance_desc") {
      sorted.sort((a, b) => Number(b.balance) - Number(a.balance));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [rows, q, category, showLowOnly, sort]);

  const lowCount = rows.filter(
    (r) => Number(r.balance) <= r.reorderLevel && r.reorderLevel > 0,
  ).length;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search_placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                category === c.value
                  ? "ring-2 ring-primary ring-offset-1 " + c.color
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {lowCount > 0 && (
          <Button
            type="button"
            variant={showLowOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowLowOnly((v) => !v)}
            className="gap-1"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            Low stock
            <Badge
              variant={showLowOnly ? "secondary" : "destructive"}
              className="ml-0.5 h-4 px-1.5 text-[10px]"
            >
              {lowCount}
            </Badge>
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Package className="mx-auto h-5 w-5" />
          <div className="mt-2">{t("empty_desc")}</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">{t("sku")}</TableHead>
                <TableHead>
                  <SortHeader
                    label={t("name")}
                    active={sort === "name"}
                    onClick={() => setSort("name")}
                  />
                </TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead className="w-40">{t("stock_level")}</TableHead>
                <TableHead className="text-right">
                  <SortHeader
                    label={t("balance")}
                    active={sort !== "name"}
                    dir={sort === "balance_asc" ? "asc" : "desc"}
                    onClick={() =>
                      setSort(sort === "balance_asc" ? "balance_desc" : "balance_asc")
                    }
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right text-xs">{t("reorder")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const balance = Number(r.balance);
                const low = balance <= r.reorderLevel && r.reorderLevel > 0;
                const zero = balance <= 0;
                const capacity = Math.max(r.reorderLevel * 3, balance, 1);
                const pct = Math.min(100, Math.max(0, (balance / capacity) * 100));
                return (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/inventory/${r.id}`} className="hover:underline">
                        {r.sku}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/inventory/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {r.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              zero
                                ? "bg-destructive"
                                : low
                                  ? "bg-warning"
                                  : "bg-emerald-500",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {low && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={cn(
                          "font-medium",
                          zero && "text-destructive",
                          low && !zero && "text-warning",
                        )}
                      >
                        {balance.toLocaleString()}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">{r.unit}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {r.reorderLevel || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir?: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        align === "right" && "justify-end",
      )}
    >
      {label}
      {active && dir === "asc" && <ChevronUp className="h-3 w-3" />}
      {active && dir === "desc" && <ChevronDown className="h-3 w-3" />}
    </button>
  );
}
