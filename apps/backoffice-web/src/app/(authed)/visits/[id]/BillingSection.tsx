"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  FileText,
  Receipt,
  CreditCard,
  Banknote,
  QrCode,
  Loader2,
  Undo2,
  XCircle,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { clientApi } from "@/lib/clientApi";

interface Payment {
  id: string;
  method: string;
  state: string;
  amount: string;
  gatewayRef: string | null;
  authorizedAt: string | null;
  completedAt: string | null;
  refundedAt: string | null;
  refundOfId: string | null;
}
interface Invoice {
  id: string;
  number: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "PARTIAL" | "VOIDED";
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  currency: string;
  issuedAt: string | null;
  voidedAt: string | null;
  payments: Payment[];
}
interface Document {
  id: string;
  type: string;
  status: string;
  templateCode: string;
  createdAt: string;
}
interface Order {
  id: string;
  status: string;
  totalAmount: string;
}

const INV_STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "destructive" | "muted"> = {
  DRAFT: "muted",
  ISSUED: "info",
  PARTIAL: "warning",
  PAID: "success",
  VOIDED: "destructive",
};

const PAY_STATE_VARIANT: Record<string, "info" | "warning" | "success" | "destructive" | "muted"> = {
  AUTHORIZED: "warning",
  COMPLETED: "success",
  SETTLED: "success",
  FAILED: "destructive",
  REFUNDED: "muted",
  VOIDED: "destructive",
};

export function BillingSection({
  invoices,
  documents,
  orders,
}: {
  invoices: Invoice[];
  documents: Document[];
  orders: Order[];
}) {
  const t = useTranslations("billing");
  const billableOrders = orders.filter((o) => o.status !== "CANCELLED");
  const unbilledOrders = billableOrders.filter(
    (o) => !invoices.some((inv) => inv.status !== "VOIDED"),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        {unbilledOrders.length > 0 && <CreateInvoiceButton orderId={unbilledOrders[0]!.id} />}
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title={t("empty_title")}
            description={t("empty_desc")}
            action={
              billableOrders.length > 0 ? (
                <CreateInvoiceButton orderId={billableOrders[0]!.id} />
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {invoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} documents={documents} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceCard({ invoice, documents }: { invoice: Invoice; documents: Document[] }) {
  const t = useTranslations("billing");
  const paid = invoice.payments
    .filter((p) => p.state === "COMPLETED" || p.state === "SETTLED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const refunded = invoice.payments
    .filter((p) => p.state === "REFUNDED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const netPaid = paid + refunded; // refunds are negative
  const due = Math.max(0, Number(invoice.total) - netPaid);
  const relatedDocs = documents.filter((d) => d.id && d.type === "E_RECEIPT");

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">{invoice.number}</span>
          <Badge variant={INV_STATUS_VARIANT[invoice.status] ?? "secondary"}>
            {invoice.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status !== "VOIDED" && invoice.status !== "PAID" && (
            <VoidInvoiceButton invoiceId={invoice.id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-sm">
        <Field label={t("subtotal")} value={`฿ ${Number(invoice.subtotal).toLocaleString()}`} />
        <Field label={t("discount")} value={`฿ ${Number(invoice.discount).toLocaleString()}`} />
        <Field label={t("total")} value={`฿ ${Number(invoice.total).toLocaleString()}`} bold />
        <Field
          label={t("due")}
          value={`฿ ${due.toLocaleString()}`}
          accent={due > 0 ? "warning" : "success"}
        />
      </div>

      {invoice.payments.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("method")}</TableHead>
              <TableHead>{t("state")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("when")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Badge variant="outline">{p.method}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={PAY_STATE_VARIANT[p.state] ?? "secondary"}>{p.state}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(p.amount).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.completedAt
                    ? formatDateTime(p.completedAt)
                    : p.refundedAt
                    ? formatDateTime(p.refundedAt)
                    : p.authorizedAt
                    ? formatDateTime(p.authorizedAt)
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <PaymentRowActions payment={p} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {due > 0 && invoice.status !== "VOIDED" && (
        <div className="pt-2">
          <PaymentDialog invoiceId={invoice.id} due={due} />
        </div>
      )}

      {invoice.status === "PAID" && relatedDocs.length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("documents")}
          </div>
          {relatedDocs.map((d) => (
            <a
              key={d.id}
              href={`/api/v1/documents/${d.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Download className="h-3 w-3" />
              {d.type} · {d.status}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: "warning" | "success";
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`${bold ? "text-base font-semibold" : "text-sm font-medium"} ${
          accent === "warning"
            ? "text-warning"
            : accent === "success"
            ? "text-success"
            : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function CreateInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const t = useTranslations("billing");
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      await clientApi.post("/api/v1/invoices", { order_id: orderId });
      toast.success(t("invoice_created"));
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      {t("create_invoice")}
    </Button>
  );
}

function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/invoices/${invoiceId}/void`, { reason });
      toast.success(t("voided"));
      setOpen(false);
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
        <Button size="sm" variant="ghost">
          <XCircle className="h-4 w-4" />
          {t("void")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("void")}</DialogTitle>
          <DialogDescription>{t("void_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{tCommon("notes")}</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || reason.length < 3}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("void")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoiceId, due }: { invoiceId: string; due: number }) {
  const router = useRouter();
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [method, setMethod] = React.useState<string>("CASH");
  const [amount, setAmount] = React.useState(due.toString());
  const [gatewayRef, setGatewayRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setAmount(due.toString());
  }, [open, due]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/payments`, {
        invoice_id: invoiceId,
        method,
        amount,
        gateway_ref: gatewayRef || undefined,
      });
      toast.success(t("paid"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("pay_failed"), {
        description: String((err as Error).message ?? err),
      });
    } finally {
      setBusy(false);
    }
  }

  const requiresGatewayRef = method === "QR_PROMPTPAY" || method === "TRANSFER";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CreditCard className="h-4 w-4" />
          {t("pay_now")} · ฿ {due.toLocaleString()}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pay_now")}</DialogTitle>
          <DialogDescription>{t("pay_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("method")}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">
                  <span className="inline-flex items-center gap-2">
                    <Banknote className="h-4 w-4" /> CASH
                  </span>
                </SelectItem>
                <SelectItem value="CARD">
                  <span className="inline-flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> CARD
                  </span>
                </SelectItem>
                <SelectItem value="QR_PROMPTPAY">
                  <span className="inline-flex items-center gap-2">
                    <QrCode className="h-4 w-4" /> QR_PROMPTPAY
                  </span>
                </SelectItem>
                <SelectItem value="TRANSFER">TRANSFER</SelectItem>
                <SelectItem value="OTHER">OTHER</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {requiresGatewayRef ? t("qr_hint") : t("cash_hint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">{t("amount")}</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={due}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          {requiresGatewayRef && (
            <div className="space-y-2">
              <Label htmlFor="ref">{t("gateway_ref")}</Label>
              <Input
                id="ref"
                value={gatewayRef}
                onChange={(e) => setGatewayRef(e.target.value)}
                placeholder="bank txn id / slip ref"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("pay_now")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRowActions({ payment }: { payment: Payment }) {
  if (payment.state === "AUTHORIZED") {
    return <CompletePayBtn id={payment.id} />;
  }
  if (payment.state === "COMPLETED" || payment.state === "SETTLED") {
    return <RefundDialog payment={payment} />;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function CompletePayBtn({ id }: { id: string }) {
  const router = useRouter();
  const t = useTranslations("billing");
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/payments/${id}/complete`, {});
      toast.success(t("completed"));
      router.refresh();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {t("complete")}
    </Button>
  );
}

function RefundDialog({ payment }: { payment: Payment }) {
  const router = useRouter();
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(payment.amount);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/payments/${payment.id}/refund`, {
        amount,
        reason,
      });
      toast.success(t("refunded"));
      setOpen(false);
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
        <Button size="sm" variant="ghost">
          <Undo2 className="h-4 w-4" />
          {t("refund")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("refund")}</DialogTitle>
          <DialogDescription>{t("refund_desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("amount")}</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={payment.amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("reason")}</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || reason.length < 3}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("refund")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
