"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileBarChart2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, clientApi } from "@/lib/clientApi";

const REPORTS = [
  { id: "doctor-productivity", needsRange: true },
  { id: "service-profitability", needsRange: true },
  { id: "patient-retention", needsRange: true },
  { id: "revenue-trend", needsRange: true },
  { id: "inventory-expiring", needsRange: false },
] as const;

type ReportId = (typeof REPORTS)[number]["id"];

interface ReportRow {
  [k: string]: unknown;
}

const COLUMNS: Record<ReportId, { key: string; label: string }[]> = {
  "doctor-productivity": [
    { key: "doctorName", label: "Doctor" },
    { key: "visits", label: "Visits" },
    { key: "procedures", label: "Procedures" },
    { key: "revenue", label: "Revenue (THB)" },
  ],
  "service-profitability": [
    { key: "serviceCode", label: "Code" },
    { key: "serviceName", label: "Name" },
    { key: "unitsSold", label: "Units" },
    { key: "revenue", label: "Revenue" },
    { key: "cogs", label: "COGS" },
    { key: "margin", label: "Margin" },
  ],
  "patient-retention": [
    { key: "cohortMonth", label: "Cohort" },
    { key: "newPatients", label: "New" },
    { key: "returnedAtLeastOnce", label: "Returned ≥1" },
    { key: "returnedAtLeastTwice", label: "Returned ≥2" },
    { key: "returnedAtLeastFiveTimes", label: "Returned ≥5" },
  ],
  "revenue-trend": [
    { key: "date", label: "Date" },
    { key: "total", label: "Total" },
    { key: "cash", label: "Cash" },
    { key: "card", label: "Card" },
    { key: "qr", label: "QR" },
    { key: "transfer", label: "Transfer" },
    { key: "wallet", label: "Wallet" },
    { key: "other", label: "Other" },
  ],
  "inventory-expiring": [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Name" },
    { key: "lotNo", label: "Lot" },
    { key: "quantityOnHand", label: "On hand" },
    { key: "expiresAt", label: "Expires at" },
    { key: "daysUntilExpiry", label: "Days left" },
  ],
};

const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

export function ReportsClient() {
  const t = useTranslations("reports");
  const [active, setActive] = React.useState<ReportId>("revenue-trend");
  const [from, setFrom] = React.useState(monthAgo());
  const [to, setTo] = React.useState(today());
  const [withinDays, setWithinDays] = React.useState(30);
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const config = REPORTS.find((r) => r.id === active)!;

  function buildQuery(format: "json" | "xlsx") {
    const sp = new URLSearchParams();
    sp.set("format", format);
    if (config.needsRange) {
      sp.set("from", from);
      sp.set("to", to);
    } else {
      sp.set("withinDays", String(withinDays));
    }
    return sp.toString();
  }

  async function load() {
    setLoading(true);
    try {
      const res = await clientApi.get<{ data: ReportRow[] }>(
        `/api/v1/reports/${active}?${buildQuery("json")}`,
      );
      setRows(res.data ?? []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function exportXlsx() {
    setExporting(true);
    try {
      const url = `/api/v1/reports/${active}?${buildQuery("xlsx")}`;
      // Reuse the same auth headers as `clientApi`. Since clientApi.get
      // doesn't expose the raw response, we fetch directly here and send
      // session cookies — Next's auth middleware reads `lx_session` cookie.
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"}${url}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `${active}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success(t("export_success"));
    } catch (err) {
      toast.error(t("export_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={active} onValueChange={(v) => setActive(v as ReportId)}>
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.id} value={r.id}>
              {t(`tab.${r.id}` as const)}
            </TabsTrigger>
          ))}
        </TabsList>

        {REPORTS.map((r) => (
          <TabsContent key={r.id} value={r.id} className="mt-4 space-y-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileBarChart2 className="h-4 w-4" />
                  {t(`tab.${r.id}` as const)}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {r.needsRange ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase">{t("from")}</Label>
                        <Input
                          type="date"
                          value={from}
                          onChange={(e) => setFrom(e.target.value)}
                          className="h-8 w-[150px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase">{t("to")}</Label>
                        <Input
                          type="date"
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                          className="h-8 w-[150px]"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase">
                        {t("within_days")}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={withinDays}
                        onChange={(e) =>
                          setWithinDays(Number(e.target.value) || 30)
                        }
                        className="h-8 w-[100px]"
                      />
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("apply")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void exportXlsx()}
                    disabled={exporting || rows.length === 0}
                  >
                    {exporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {t("export_excel")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ReportTable rows={rows} reportId={r.id} loading={loading} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ReportTable({
  rows,
  reportId,
  loading,
}: {
  rows: ReportRow[];
  reportId: ReportId;
  loading: boolean;
}) {
  const t = useTranslations("reports");
  const cols = COLUMNS[reportId];
  if (loading)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  if (rows.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {cols.map((c) => (
            <TableHead key={c.key}>{c.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {cols.map((c) => (
              <TableCell key={c.key} className="tabular-nums">
                {formatCell(r[c.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}
