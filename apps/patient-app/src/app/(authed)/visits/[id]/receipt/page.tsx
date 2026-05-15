import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, FileText } from "lucide-react";
import { getPatientSession } from "@/lib/session";
import { patientJson } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { formatCurrency } from "@/lib/utils";

type Receipt = {
  visit_id: string;
  completed_at: string | null;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    currency: string;
  }>;
  receipt: {
    id: string;
    storage_key: string;
    download_path: string;
  } | null;
};

export default async function ReceiptPage({
  params,
}: {
  params: { id: string };
}) {
  const session = getPatientSession()!;
  const t = await getTranslations("visits");

  let receipt: Receipt | null = null;
  try {
    const res = await patientJson<{ data: Receipt }>(
      session,
      `/api/v1/patient/visits/${params.id}/receipt`,
    );
    receipt = res.data;
  } catch {
    /* fallthrough */
  }

  return (
    <>
      <PageHeader
        title={t("view_receipt")}
        right={
          <Link
            href="/visits"
            className="text-xs text-muted-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <main className="px-4 pt-4 pb-4">
        {!receipt ? (
          <p className="text-center text-sm text-muted-foreground py-12">
            {t("no_receipt")}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <p className="text-xs text-muted-foreground">
                {receipt.completed_at
                  ? new Date(receipt.completed_at).toLocaleString()
                  : ""}
              </p>
              {receipt.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="mt-2 flex items-center justify-between"
                >
                  <span className="text-sm">#{inv.number}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(inv.total, inv.currency)}
                  </span>
                </div>
              ))}
            </div>
            {receipt.receipt ? (
              <a
                href={receipt.receipt.download_path}
                target="_blank"
                rel="noreferrer"
                className="w-full h-12 rounded-xl bg-primary-gradient text-white font-semibold shadow-soft flex items-center justify-center gap-2"
              >
                <FileText className="h-4 w-4" />
                {t("view_receipt")}
              </a>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                {t("no_receipt")}
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}
