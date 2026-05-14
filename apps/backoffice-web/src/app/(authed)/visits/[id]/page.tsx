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
import { MedicalCertButton } from "./MedicalCertButton";
import { LabsSection, type LabOrder } from "./LabsSection";
import { PhotosSection, type PatientPhoto } from "./PhotosSection";
import { AssignRoomDialog } from "./AssignRoomDialog";

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

  // Derive capabilities from the role codes baked into the session cookie at
  // login time. The API still enforces ABAC server-side; these flags only
  // drive UX (hide buttons / lock fields) so users aren't shown actions they
  // can't actually perform.
  const roles = session.roles ?? [];
  const isPrivileged = roles.includes("ADMIN");
  const canWriteEmr = isPrivileged || roles.includes("DOCTOR");
  const canWriteOrder = isPrivileged || roles.includes("DOCTOR");
  // Billing capabilities (mirrors seed.ts permission grants):
  //   payment:write → DOCTOR | MANAGER | RECEPTION | ADMIN
  //   payment:void / invoice:void → MANAGER | ADMIN (refund + void)
  const canWritePayment =
    isPrivileged ||
    roles.includes("DOCTOR") ||
    roles.includes("MANAGER") ||
    roles.includes("RECEPTION");
  const canVoidPayment = isPrivileged || roles.includes("MANAGER");
  // Phase M / S — clinical capabilities. lab:write is doctor; lab:collect is
  // nurse; lab:result is nurse (per seed). Photos require patient:write
  // which spans every clinical role + reception.
  const canOrderLab = isPrivileged || roles.includes("DOCTOR");
  const canCollectLab = isPrivileged || roles.includes("NURSE");
  const canResultLab = isPrivileged || roles.includes("NURSE");
  const canWritePhoto =
    isPrivileged ||
    roles.includes("DOCTOR") ||
    roles.includes("NURSE") ||
    roles.includes("MANAGER") ||
    roles.includes("RECEPTION");

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
    // Documents tied to either the invoice (E_RECEIPT / TAX_INVOICE) or the
    // visit itself (MEDICAL_CERT). We fetch both ref_types in parallel and
    // merge — cheap, keeps the API surface narrow.
    Promise.all([
      apiJson<{
        data: Array<{
          id: string;
          type: string;
          status: string;
          templateCode: string;
          createdAt: string;
        }>;
      }>(session, `/api/v1/documents?ref_type=INVOICE&limit=100`).catch(() => ({
        data: [],
      })),
      apiJson<{
        data: Array<{
          id: string;
          type: string;
          status: string;
          templateCode: string;
          createdAt: string;
          refId: string | null;
        }>;
      }>(
        session,
        `/api/v1/documents?ref_type=VISIT&ref_id=${params.id}&limit=100`,
      ).catch(() => ({ data: [] })),
    ]).then(([invDocs, visitDocs]) => ({
      data: [...invDocs.data, ...visitDocs.data],
    })),
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

  // Resolve procedureCode → human-readable name via Service catalog (ABAC:
  // appointment:read covers everyone who would ever land on this page). The
  // map is also reused for the orders tab to label "PROCEDURE" rows.
  const servicesRes = await apiJson<{
    data: Array<{ code: string; name: string; nameTh: string; procedureCode: string | null }>;
  }>(session, `/api/v1/services?active=false`).catch(() => ({ data: [] }));
  const procNameMap = new Map<string, string>();
  for (const s of servicesRes.data) {
    if (s.procedureCode) procNameMap.set(s.procedureCode, s.nameTh || s.name);
  }

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
    <SoapPanel
      visitId={visit.id}
      patientId={visit.patient.id}
      existing={existingEmr}
      canWrite={canWriteEmr}
    />
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
        {canWriteOrder && <NewOrderDialog visitId={visit.id} />}
      </CardHeader>
      <CardContent className="p-0">
        {orders.length === 0 ? (
          <EmptyState
            className="m-6"
            icon={<Activity className="h-5 w-5" />}
            title={t("orders.empty_title")}
            description={
              canWriteOrder
                ? t("orders.empty_desc")
                : (t("orders.empty_readonly") ?? t("orders.empty_desc"))
            }
            action={canWriteOrder ? <NewOrderDialog visitId={visit.id} /> : undefined}
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
                      <TableHead>{t("orders.description")}</TableHead>
                      <TableHead className="text-right">{t("orders.qty")}</TableHead>
                      <TableHead className="text-right">{t("orders.total")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {o.items.map((it) => {
                      const resolvedName =
                        it.itemType === "PROCEDURE"
                          ? (procNameMap.get(it.refId) ?? it.description)
                          : it.description;
                      return (
                        <TableRow key={it.id}>
                          <TableCell>
                            <Badge variant="outline">{it.itemType}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="text-sm">{resolvedName}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {it.refId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(it.qty).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(it.total).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">
                      {procNameMap.get(p.procedureCode) ?? p.notes ?? p.procedureCode}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {p.procedureCode}
                    </div>
                  </div>
                </TableCell>
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
      canWrite={canWritePayment}
      canVoid={canVoidPayment}
    />
  );

  // Phase M & S — fetch labs + photos in parallel (already after main data
  // load to keep the critical path narrow). Failures here gracefully fall
  // back to empty arrays rather than 500-ing the visit page.
  type RoomResource = {
    id: string;
    code: string;
    name: string;
    activeReservation: {
      appointmentId: string | null;
    } | null;
  };
  const [labRes, photoRes, roomRes] = visit.patient
    ? await Promise.all([
        apiJson<{ data: LabOrder[] }>(
          session,
          `/api/v1/lab/orders?visit_id=${visit.id}`,
        ).catch(() => ({ data: [] as LabOrder[] })),
        apiJson<{ data: PatientPhoto[] }>(
          session,
          `/api/v1/patients/${visit.patient.id}/photos?visit_id=${visit.id}`,
        ).catch(() => ({ data: [] as PatientPhoto[] })),
        apiJson<{ data: RoomResource[] }>(session, `/api/v1/resources?type=ROOM`).catch(
          () => ({ data: [] as RoomResource[] }),
        ),
      ])
    : [
        { data: [] as LabOrder[] },
        { data: [] as PatientPhoto[] },
        { data: [] as RoomResource[] },
      ];

  const currentRoom = visit.appointment
    ? roomRes.data.find(
        (r) => r.activeReservation?.appointmentId === visit.appointment!.id,
      )
    : undefined;

  const labs = visit.patient ? (
    <LabsSection
      visitId={visit.id}
      patientId={visit.patient.id}
      orders={labRes.data}
      canOrder={canOrderLab}
      canCollect={canCollectLab}
      canResult={canResultLab}
    />
  ) : null;

  const photos = visit.patient ? (
    <PhotosSection
      visitId={visit.id}
      patientId={visit.patient.id}
      photos={photoRes.data}
      canWrite={canWritePhoto}
    />
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t("visits.title")}: ${patientLabel}`}
        description={
          <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span>
              HN {visit.patient?.hn ?? "—"} · {visit.id}
            </span>
            {currentRoom && (
              <span className="rounded-md bg-info/10 px-2 py-0.5 text-info">
                🚪 {currentRoom.name} ({currentRoom.code})
              </span>
            )}
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
              <AssignRoomDialog
                visitId={visit.id}
                currentRoomId={currentRoom?.id ?? null}
                appointmentId={visit.appointment?.id ?? null}
                currentRoomLabel={
                  currentRoom ? `${currentRoom.name} (${currentRoom.code})` : null
                }
              />
            )}
            {canWriteEmr && <MedicalCertButton visitId={visit.id} />}
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
        labs={labs}
        photos={photos}
        procedureCount={allProcedures.length}
        orderCount={orders.length}
        labCount={labRes.data.length}
        photoCount={photoRes.data.length}
      />
    </div>
  );
}
