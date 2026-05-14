"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ReceiptText, Loader2, Download } from "lucide-react";
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
import { clientApi } from "@/lib/clientApi";

export function TaxInvoiceButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [branch, setBranch] = React.useState("00000");
  const [address, setAddress] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Validation: Thai tax id is 13 digits for legal entities and individuals.
  // Some buyers (small shops) use 10-13 digits — accept both ranges.
  const taxIdValid = /^\d{10,13}$/.test(taxId.trim());
  const branchValid = /^\d{0,5}$/.test(branch.trim());
  const valid =
    name.trim().length > 1 && taxIdValid && branchValid && address.trim().length > 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast.error(t("tax_invoice.validation_failed"));
      return;
    }
    setBusy(true);
    try {
      const res = await clientApi.post<{
        data: {
          document: { id: string };
          taxInvoiceNumber: string;
        };
      }>(`/api/v1/invoices/${invoiceId}/tax-invoice`, {
        buyer_name: name.trim(),
        buyer_tax_id: taxId.trim(),
        buyer_branch_code: branch.trim() || "00000",
        buyer_address: address.trim(),
      });
      toast.success(t("tax_invoice.issued_success"), {
        description: res.data.taxInvoiceNumber,
        action: {
          label: <Download className="h-4 w-4" />,
          onClick: () =>
            window.open(
              `/api/v1/documents/${res.data.document.id}/download`,
              "_blank",
            ),
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("tax_invoice.issued_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ReceiptText className="h-4 w-4" /> {t("tax_invoice.issue")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tax_invoice.issue")}</DialogTitle>
          <DialogDescription>
            {t("tax_invoice.issue_subtitle", { number: invoiceNumber })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ti-name">{t("tax_invoice.buyer_name")}</Label>
            <Input
              id="ti-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("tax_invoice.buyer_name_placeholder")}
              maxLength={160}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ti-taxid">{t("tax_invoice.tax_id")}</Label>
              <Input
                id="ti-taxid"
                value={taxId}
                onChange={(e) =>
                  setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))
                }
                placeholder="0123456789012"
                className={`font-mono ${
                  taxId.length > 0 && !taxIdValid ? "border-destructive" : ""
                }`}
              />
              {taxId.length > 0 && !taxIdValid && (
                <p className="text-[11px] text-destructive">
                  {t("tax_invoice.tax_id_invalid")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ti-branch">{t("tax_invoice.branch_code")}</Label>
              <Input
                id="ti-branch"
                value={branch}
                onChange={(e) =>
                  setBranch(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                placeholder="00000"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("tax_invoice.branch_code_hint")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ti-addr">{t("tax_invoice.address")}</Label>
            <Textarea
              id="ti-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("tax_invoice.address_placeholder")}
              rows={3}
              maxLength={400}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !valid}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("tax_invoice.issue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
