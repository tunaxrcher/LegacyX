"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, FileText, Beaker, ArrowRight, Loader2 } from "lucide-react";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("labs.panel") ?? "Panel"}</TableHead>
              <TableHead>{t("common.status") ?? "Status"}</TableHead>
              <TableHead>{t("labs.ordered_at") ?? "Ordered"}</TableHead>
              <TableHead>{t("labs.results") ?? "Results"}</TableHead>
              <TableHead className="text-right">{t("common.actions") ?? "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.panel}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[o.status] ?? "muted"}>{o.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(o.createdAt)}
                </TableCell>
                <TableCell>
                  {o.results.length > 0 ? (
                    <div className="flex items-center gap-1 text-xs">
                      <FileText className="h-3 w-3" />
                      {o.results.length} reading{o.results.length > 1 ? "s" : ""}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <LabRowActions
                    order={o}
                    canCollect={canCollect}
                    canResult={canResult}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
              {t("labs.panel_hint") ?? "Common: CBC, LIPID, FBS, HBA1C, TSH, LFT, RFT"}
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
