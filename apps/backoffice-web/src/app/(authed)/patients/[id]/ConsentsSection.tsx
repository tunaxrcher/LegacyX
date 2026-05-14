"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ScrollText, Plus, Loader2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
import { clientApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/utils";

interface ConsentRow {
  id: string;
  documentType: string;
  documentVersion: string;
  contentHash: string;
  signedAt: string;
  signedByName: string;
}

// Document templates the worker knows how to render. New types are
// configurable later via /manager/services or /manager/templates.
const CONSENT_TYPES = [
  { code: "CONSENT_GENERAL", labelKey: "consents.type_general" },
  { code: "CONSENT_LASER", labelKey: "consents.type_laser" },
  { code: "CONSENT_INJECTION", labelKey: "consents.type_injection" },
  { code: "CONSENT_PHOTO", labelKey: "consents.type_photo" },
  { code: "CONSENT_DATA", labelKey: "consents.type_data" },
];

export function ConsentsSection({
  patientId,
  patientName,
  consents,
}: {
  patientId: string;
  patientName: string;
  consents: ConsentRow[];
}) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <CaptureConsentDialog
          patientId={patientId}
          defaultSigner={patientName}
        />
      </div>
      {consents.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" />}
          title={t("consents.empty_title")}
          action={
            <CaptureConsentDialog
              patientId={patientId}
              defaultSigner={patientName}
            />
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("consents.document_type")}</TableHead>
                  <TableHead>{t("consents.version")}</TableHead>
                  <TableHead>{t("consents.signed_at")}</TableHead>
                  <TableHead>{t("consents.signed_by")}</TableHead>
                  <TableHead className="text-right">{t("consents.hash")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consents.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Badge variant="outline">{c.documentType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.documentVersion}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(c.signedAt)}
                    </TableCell>
                    <TableCell className="text-sm">{c.signedByName}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                      {c.contentHash.slice(0, 12)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CaptureConsentDialog({
  patientId,
  defaultSigner,
}: {
  patientId: string;
  defaultSigner: string;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [docType, setDocType] = React.useState(CONSENT_TYPES[0]!.code);
  const [version, setVersion] = React.useState("v1");
  const [signedBy, setSignedBy] = React.useState(defaultSigner);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setSignedBy(defaultSigner);
  }, [open, defaultSigner]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await clientApi.post(`/api/v1/patients/${patientId}/consents`, {
        document_type: docType,
        document_version: version,
        signed_by_name: signedBy.trim() || defaultSigner,
        channel: "DESK",
      });
      toast.success(t("consents.captured_success"));
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t("consents.captured_failed"), {
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
          <Plus className="h-4 w-4" /> {t("consents.capture")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            {t("consents.capture")}
          </DialogTitle>
          <DialogDescription>{t("consents.capture_subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("consents.document_type")}</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSENT_TYPES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {t(c.labelKey as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="version">{t("consents.version")}</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signed-by">{t("consents.signed_by")}</Label>
              <Input
                id="signed-by"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !signedBy.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("consents.capture")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
