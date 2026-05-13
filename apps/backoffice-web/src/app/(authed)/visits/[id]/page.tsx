import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Activity } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { NewOrderDialog } from "./NewOrderDialog";
import { ProcedureActions } from "./ProcedureActions";
import { BillingSection } from "./BillingSection";
import { CompleteVisitButton } from "./CompleteVisitButton";
import { SoapPanel, type ExistingEmr } from "./SoapPanel";
import { VisitTabs } from "./VisitTabs";
import { OverviewPanel } from "./OverviewPanel";

export const dynamic = "force-dynamic";

type Patient = { id: string; hn: string; firstName: string; lastName: string } | null;
type Visit = {
  id: string;
  status: string;
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  patient: Patient;
  patientId?: string | null;
  appointment: { id: string; scheduledAt: string } | null;
};
type OrderItem = {
  id: string;
  itemType: string;
  refId: string;
  description: string;
  qty: string;
  total: string;
};
type Procedure = {
  id: string;
  orderId: string;
  procedureCode: string;
  status: string;
  performedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
};
type Order = {
  id: string;
  status: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  procedures: Procedure[];
};

const PROC_STATUS_VARIANT: Record<
  string,
  "info" | "warning" | "success" | "destructive" | "muted"
> = {
  SCHEDULED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export default async function VisitDetailPage({ params }: { params: { id: string } }) {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const [visitList, orderList, invoiceList, documentList, emrRes] = await Promise.all([
    apiJson<{ data: Visit[] }>(session, `/api/v1/visits?limit=100`).catch(() => ({
      data: [] as Visit[],
    })),
    apiJson<{ data: Order[] }>(session, `/api/v1/orders?visit_id=${params.id}`).catch(
      () => ({ data: [] as Order[] }),
    ),
    apiJson<{
      data: Array<{
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
        payments: Array<{
          id: string;
          method: string;
          state: string;
          amount: string;
          gatewayRef: string | null;
          authorizedAt: string | null;
          completedAt: string | null;
          refundedAt: string | null;
          refundOfId: string | null;
        }>;
      }>;
    }>(session, `/api/v1/invoices?visit_id=${params.id}`).catch(() => ({ data: [] })),
    apiJson<{
      data: Array<{
        id: string;
        type: string;
        status: string;
        templateCode: string;
        createdAt: string;
      }>;
    }>(session, `/api/v1/documents?ref_type=INVOICE&limit=100`).catch(() => ({ data: [] })),
    apiJson<{ data: ExistingEmr | null }>(
      session,
      `/api/v1/emr/by-visit/${params.id}`,
    ).catch(() => ({ data: null })),
  ]);
  const visit = visitList.data.find((v) => v.id === params.id);
  if (!visit) notFound();
  const orders = orderList.data;
  const allProcedures = orders.flatMap((o) => o.procedures);
  const existingEmr = emrRes.data;

  // Patient wallets for course-based completion
  let patientWallets: Array<{
    id: string;
    balance: number;
    product: { name: string } | null;
  }> = [];
  if (visit.patient) {
    const res = await apiJson<{
      data: Array<{
        id: string;
        balance: number;
        productId: string;
        product?: { name: string };
      }>;
    }>(session, `/api/v1/wallet?patient_id=${visit.patient.id}`).catch(() => ({ data: [] }));
    patientWallets = res.data.map((w) => ({
      id: w.id,
      balance: w.balance,
      product: w.product ?? null,
    }));
  }

  const patientLabel = visit.patient
    ? `${visit.patient.firstName} ${visit.patient.lastName}`
    : "—";

  const overview = (
    <OverviewPanel
      patient={visit.patient}
      checkedInAt={visit.checkedInAt}
      startedAt={visit.startedAt}
      orderCount={orders.length}
      emrStatus={existingEmr ? existingEmr.status : "NONE"}
      emrVersion={existingEmr ? existingEmr.currentVersion : null}
      labels={{
        name: t("patients.name"),
        checkedIn: t("visits.checked_in_at"),
        started: t("visits.started_at"),
        orders: t("orders.count"),
        emr: t("visits.tab_soap") ?? "EMR",
      }}
    />
  );

  const soap = visit.patient ? (
    <SoapPanel visitId={visit.id} patientId={visit.patient.id} existing={existingEmr} />
  ) : (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">
        Patient missing — cannot write SOAP note.
      </CardContent>
    </Card>
  );

  const ordersTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("orders.title")}</CardTitle>
        <NewOrderDialog visitId={visit.id} />
      </CardHeader>
      <CardContent className="p-0">
        {orders.length === 0 ? (
          <EmptyState
            className="m-6"
            icon={<Activity className="h-5 w-5" />}
            title={t("orders.empty_title")}
            description={t("orders.empty_desc")}
            action={<NewOrderDialog visitId={visit.id} />}
          />
        ) : (
          <div className="space-y-0 divide-y">
            {orders.map((o) => (
              <div key={o.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">{o.id.slice(-8)}</span>
                    <Badge
                      variant={
                        o.status === "CANCELLED"
                          ? "destructive"
                          : o.status === "FULFILLED"
                            ? "success"
                            : "info"
                      }
                    >
                      {o.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    ฿ {Number(o.totalAmount).toLocaleString()}
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("orders.item_type")}</TableHead>
                      <TableHead>{t("orders.ref")}</TableHead>
                      <TableHead>{t("orders.description")}</TableHead>
                      <TableHead className="text-right">{t("orders.qty")}</TableHead>
                      <TableHead className="text-right">{t("orders.total")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>
                          <Badge variant="outline">{it.itemType}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{it.refId}</TableCell>
                        <TableCell>{it.description}</TableCell>
                        <TableCell className="text-right">
                          {Number(it.qty).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(it.total).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const proceduresTab = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("procedures.title")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("procedures.code")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("procedures.started")}</TableHead>
              <TableHead>{t("procedures.completed")}</TableHead>
              <TableHead className="text-right">{t("procedures.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allProcedures.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.procedureCode}</TableCell>
                <TableCell>
                  <Badge variant={PROC_STATUS_VARIANT[p.status] ?? "secondary"}>
                    {t.has(`procedures.status.${p.status}`)
                      ? t(`procedures.status.${p.status}` as never)
                      : p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.startedAt ? formatDateTime(p.startedAt) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.completedAt ? formatDateTime(p.completedAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <ProcedureActions procedure={p} wallets={patientWallets} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const billing = (
    <BillingSection
      invoices={invoiceList.data}
      documents={documentList.data}
      orders={orders.map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: o.totalAmount,
      }))}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t("visits.title")}: ${patientLabel}`}
        description={
          <span className="font-mono text-xs">
            HN {visit.patient?.hn ?? "—"} · {visit.id}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/visits">
                <ArrowLeft className="h-4 w-4" />
                {t("common.back") ?? "Back"}
              </Link>
            </Button>
            <Badge
              variant={
                PROC_STATUS_VARIANT[
                  visit.status === "IN_PROGRESS" ? "IN_PROGRESS" : "SCHEDULED"
                ] ?? "secondary"
              }
            >
              {t.has(`visits.status.${visit.status}`)
                ? t(`visits.status.${visit.status}` as never)
                : visit.status}
            </Badge>
            {visit.status !== "COMPLETED" && visit.status !== "CANCELLED" && (
              <CompleteVisitButton visitId={visit.id} />
            )}
          </div>
        }
      />

      <VisitTabs
        overview={overview}
        soap={soap}
        orders={ordersTab}
        procedures={proceduresTab}
        billing={billing}
        procedureCount={allProcedures.length}
        orderCount={orders.length}
      />
    </div>
  );
}
