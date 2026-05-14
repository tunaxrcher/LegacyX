"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
} from "lucide-react";
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
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";
import { RecordResultDialog } from "./RecordResultDialog";
import {
  COMMON_PANELS,
  NEXT_STEP_LABEL,
  STATUS_VARIANT,
  type LabOrder,
  type LabResult,
} from "./types";

function StatusBadge({ status }: { status: LabOrder["status"] }) {
  const t = useTranslations();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "muted"}>
      {t(`labs.status_${status.toLowerCase()}` as never)}
    </Badge>
  );
}

function ResultDisplay({ result }: { result: LabResult }) {
  const t = useTranslations();
  const entries = Object.entries(result.payload ?? {});
  const isImage =
    result.fileUrl !== null && /\.(jpe?g|png|webp|heic|gif)$/i.test(result.fileUrl);
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground">
        {t("labs.resulted_at")} {formatDateTime(result.resultedAt)}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">
          {t("labs.no_payload")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("labs.test")}</TableHead>
              <TableHead>{t("labs.value")}</TableHead>
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
        <div className="space-y-1.5">
          {isImage ? (
            <a
              href={result.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-xs overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.fileUrl}
                alt="lab attachment"
                className="max-h-60 w-full object-contain"
              />
            </a>
          ) : (
            <a
              href={result.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              {t("labs.open_pdf")}
            </a>
          )}
        </div>
      )}
    </div>
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
      toast.error(t("common.submit"), {
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
          {t("labs.collect")}
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
          {t("labs.processing")}
        </Button>
      )}
      {(order.status === "COLLECTED" || order.status === "PROCESSING") &&
        canResult && (
          <RecordResultDialog orderId={order.id} panel={order.panel} />
        )}
    </div>
  );
}

export function OrderRow({
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
  const nextHint = NEXT_STEP_LABEL[order.status];

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
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {t("labs.ordered_at")} {formatDateTime(order.createdAt)}
            {order.notes ? ` · ${order.notes}` : ""}
          </div>
          {nextHint && (
            <div className="mt-1 flex items-start gap-1 text-[11px] italic text-muted-foreground">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
              {t(`labs.next_${order.status.toLowerCase()}` as never)}
            </div>
          )}
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
              {order.results.length} {t("labs.reading")}
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
