"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Beaker,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";

export type LabResult = {
  id: string;
  payload: Record<string, unknown>;
  fileUrl: string | null;
  resultedAt: string;
};

export type LabOrder = {
  id: string;
  panel: string;
  status: "ORDERED" | "COLLECTED" | "PROCESSING" | "RESULTED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  results: LabResult[];
};

const STATUS_VARIANT: Record<LabOrder["status"], "info" | "warning" | "success" | "muted"> = {
  ORDERED: "info",
  COLLECTED: "warning",
  PROCESSING: "warning",
  RESULTED: "success",
  CANCELLED: "muted",
};

// Panels used at this clinic — shown as quick picks. Code (UPPERCASE) goes
// into the panel field; the human-readable label is just for the picker.
const COMMON_PANELS: Array<{ code: string; label: string; labelTh: string }> = [
  { code: "CBC", label: "Complete Blood Count", labelTh: "ตรวจความสมบูรณ์ของเม็ดเลือด" },
  { code: "LIPID", label: "Lipid Profile", labelTh: "ตรวจไขมันในเลือด" },
  { code: "FBS", label: "Fasting Blood Sugar", labelTh: "ตรวจน้ำตาลในเลือดอดอาหาร" },
  { code: "HBA1C", label: "Hemoglobin A1c", labelTh: "ตรวจน้ำตาลสะสม 3 เดือน" },
  { code: "TSH", label: "Thyroid Stimulating Hormone", labelTh: "ตรวจไทรอยด์" },
  { code: "LFT", label: "Liver Function Test", labelTh: "ตรวจการทำงานของตับ" },
  { code: "RFT", label: "Renal Function Test", labelTh: "ตรวจการทำงานของไต" },
  { code: "URINE", label: "Urinalysis", labelTh: "ตรวจปัสสาวะ" },
];

export function LabsSection({
  visitId,
  patientId,
  orders,
  canOrder,
  canCollect,
  canResult,
}: {
  visitId: string;
  patientId: string;
  orders: LabOrder[];
  canOrder: boolean;
  canCollect: boolean;
  canResult: boolean;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("labs.title") ?? "Lab Orders"}</h3>
          <p className="text-sm text-muted-foreground">
            {t("labs.subtitle") ?? "Order panels, track collection, attach results"}
          </p>
        </div>
        {canOrder && (
          <NewLabOrderDialog visitId={visitId} patientId={patientId} />
        )}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Beaker className="h-5 w-5" />}
          title={t("labs.empty_title") ?? "No labs ordered"}
          description={t("labs.empty_desc") ?? "Order a panel to track collection and results"}
        />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <LabOrderRow
              key={o.id}
              order={o}
              canCollect={canCollect}
              canResult={canResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LabOrderRow({
  order,
  canCollect,
  canResult,
}: {
  order: LabOrder;
  canCollect: boolean;
  canResult: boolean;
}) {
  const t = useTranslations();
  const [expanded, setExpanded] = React.useState(order.status === "RESULTED");
  const panelMeta = COMMON_PANELS.find((p) => p.code === order.panel);

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{order.panel}</span>
            {panelMeta && (
              <span className="text-xs text-muted-foreground">
                · {panelMeta.labelTh}
              </span>
            )}
            <Badge variant={STATUS_VARIANT[order.status] ?? "muted"}>
              {order.status}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {t("labs.ordered_at") ?? "Ordered"} {formatDateTime(order.createdAt)}
            {order.notes ? ` · ${order.notes}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <LabRowActions
            order={order}
            canCollect={canCollect}
            canResult={canResult}
          />
          {order.results.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((s) => !s)}
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {order.results.length} {t("labs.reading") ?? "reading"}
              {order.results.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>
      {expanded && order.results.length > 0 && (
        <div className="border-t bg-muted/30 p-3">
          {order.results.map((r) => (
            <ResultDisplay key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultDisplay({ result }: { result: LabResult }) {
  const t = useTranslations();
  const entries = Object.entries(result.payload ?? {});
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground">
        {t("labs.resulted_at") ?? "Resulted at"} {formatDateTime(result.resultedAt)}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">
          {t("labs.no_payload") ?? "No structured payload"}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("labs.test") ?? "Test"}</TableHead>
              <TableHead>{t("labs.value") ?? "Value"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([k, v]) => (
              <TableRow key={k}>
                <TableCell className="font-mono text-xs">{k}</TableCell>
                <TableCell className="font-mono text-xs">{String(v)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {result.fileUrl && (
        <a
          href={result.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FileText className="h-3 w-3" />
          {t("labs.open_pdf") ?? "Open PDF"}
        </a>
      )}
    </div>
  );
}

function NewLabOrderDialog({
  visitId,
  patientId,
}: {
  visitId: string;
  patientId: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!panel.trim()) return;
    setBusy(true);
    try {
      await clientApi.post("/api/v1/lab/orders", {
        patient_id: patientId,
        visit_id: visitId,
        panel: panel.trim().toUpperCase(),
        notes: notes.trim() || undefined,
      });
      toast.success(t("labs.created") ?? "Lab order created");
      setOpen(false);
      setPanel("");
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(t("labs.create_failed") ?? "Failed to create lab order", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t("labs.new") ?? "Order Lab"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("labs.new") ?? "Order Lab"}</DialogTitle>
          <DialogDescription>
            {t("labs.new_desc") ?? "Pick a panel · doctors only · creates the order in ORDERED state"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="panel">{t("labs.panel") ?? "Panel"}</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PANELS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPanel(p.code)}
                  title={p.labelTh}
                  className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                    panel === p.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.code}
                </button>
              ))}
            </div>
            <Input
              id="panel"
              value={panel}
              onChange={(e) => setPanel(e.target.value.toUpperCase())}
              placeholder="CBC / LIPID / HBA1C"
              className="font-mono uppercase"
              maxLength={40}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              {t("labs.panel_hint") ?? "Pick a chip above or type a custom panel code."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("labs.notes") ?? "Notes (optional)"}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !panel.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("labs.create") ?? "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LabRowActions({
  order,
  canCollect,
  canResult,
}: {
  order: LabOrder;
  canCollect: boolean;
  canResult: boolean;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [busy, setBusy] = React.useState(false);

  async function transition(status: "COLLECTED" | "PROCESSING" | "CANCELLED") {
    setBusy(true);
    try {
      await clientApi.patch(`/api/v1/lab/orders/${order.id}`, { status });
      toast.success(`Lab → ${status}`);
      router.refresh();
    } catch (err) {
      toast.error(t("common.submit") ?? "Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  if (order.status === "RESULTED" || order.status === "CANCELLED") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="inline-flex items-center gap-1">
      {order.status === "ORDERED" && canCollect && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => transition("COLLECTED")}
        >
          <ArrowRight className="h-3 w-3" />
          {t("labs.collect") ?? "Collected"}
        </Button>
      )}
      {order.status === "COLLECTED" && canCollect && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => transition("PROCESSING")}
        >
          <ArrowRight className="h-3 w-3" />
          {t("labs.processing") ?? "To Lab"}
        </Button>
      )}
      {(order.status === "COLLECTED" || order.status === "PROCESSING") && canResult && (
        <RecordResultDialog orderId={order.id} panel={order.panel} />
      )}
    </div>
  );
}

function RecordResultDialog({
  orderId,
  panel,
}: {
  orderId: string;
  panel: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Parse `KEY: VALUE` lines into a structured payload.
      const payload: Record<string, string> = {};
      for (const line of text.split("\n")) {
        const idx = line.indexOf(":");
        if (idx <= 0) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) payload[k] = v;
      }
      if (Object.keys(payload).length === 0) {
        toast.error(t("labs.parse_failed") ?? "Provide at least one KEY: VALUE line");
        return;
      }
      await clientApi.post(`/api/v1/lab/orders/${orderId}/result`, {
        payload,
      });
      toast.success(t("labs.resulted") ?? "Result recorded");
      setOpen(false);
      setText("");
      router.refresh();
    } catch (err) {
      toast.error(t("labs.result_failed") ?? "Failed to record result", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={busy}>
          <FileText className="h-3 w-3" />
          {t("labs.record_result") ?? "Record Result"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("labs.record_result") ?? "Record Result"} — {panel}
          </DialogTitle>
          <DialogDescription>
            {t("labs.result_desc") ??
              "One KEY: VALUE per line. PDF report can be attached separately."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"WBC: 7.4 x10^9/L\nHGB: 13.2 g/dL\nPLT: 250"}
            rows={8}
            className="font-mono text-sm"
            required
          />
          <DialogFooter>
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("labs.save_result") ?? "Save Result"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
