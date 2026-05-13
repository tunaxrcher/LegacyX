import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PillBottle, ExternalLink, CheckCircle2 } from "lucide-react";
import { getSessionFromCookies } from "@/lib/session";
import { apiJson } from "@/lib/api";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { DispenseButton } from "./DispenseButton";

export const dynamic = "force-dynamic";

type QueueRow = {
  orderId: string;
  orderStatus: string;
  orderedAt: string;
  visitId: string;
  patient: { id: string; hn: string; firstName: string; lastName: string } | null;
  medications: Array<{
    id: string;
    refId: string;
    description: string;
    qty: string;
    unit: string | null;
  }>;
  dispense: {
    id: string;
    status: string;
    dispensedAt: string | null;
    notes: string | null;
  } | null;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "muted"> = {
  DISPENSED: "success",
  READY: "info",
  PREPARING: "warning",
  CANCELLED: "muted",
};

export default async function PharmacyPage() {
  const session = getSessionFromCookies();
  if (!session) redirect("/login");
  const t = await getTranslations();

  const res = await apiJson<{ data: QueueRow[] }>(session, "/api/v1/pharmacy").catch(
    () => ({ data: [] as QueueRow[] }),
  );
  const rows = res.data;

  const pending = rows.filter((r) => !r.dispense || r.dispense.status !== "DISPENSED");
  const completed = rows.filter((r) => r.dispense?.status === "DISPENSED");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pharmacy.title")}
        description={t("pharmacy.subtitle")}
      />

      {/* Pending queue */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <PillBottle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">{t("pharmacy.pending")}</h3>
            <Badge variant="warning">{pending.length}</Badge>
          </div>
          {pending.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={t("pharmacy.empty_title")}
              description={t("pharmacy.empty_desc")}
            />
          ) : (
            <PharmacyTable rows={pending} t={t} canDispense />
          )}
        </CardContent>
      </Card>

      {/* Dispensed today (collapsed) */}
      {completed.length > 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <h3 className="text-sm font-semibold">{t("pharmacy.dispensed_recently")}</h3>
              <Badge variant="success">{completed.length}</Badge>
            </div>
            <PharmacyTable rows={completed} t={t} canDispense={false} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function PharmacyTable({
  rows,
  t,
  canDispense,
}: {
  rows: QueueRow[];
  t: Translator;
  canDispense: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("pharmacy.patient")}</TableHead>
          <TableHead>{t("pharmacy.medications")}</TableHead>
          <TableHead>{t("pharmacy.ordered_at")}</TableHead>
          <TableHead>{t("pharmacy.status")}</TableHead>
          <TableHead className="text-right">{t("pharmacy.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.orderId}>
            <TableCell>
              {r.patient ? (
                <div className="text-sm">
                  <div className="font-medium">
                    {r.patient.firstName} {r.patient.lastName}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {r.patient.hn}
                  </div>
                </div>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="max-w-[320px]">
              <ul className="space-y-0.5 text-xs">
                {r.medications.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <PillBottle className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{m.description}</span>
                    <span className="font-mono text-muted-foreground">
                      × {Number(m.qty).toLocaleString()}
                      {m.unit ? ` ${m.unit}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDateTime(r.orderedAt)}
            </TableCell>
            <TableCell>
              {r.dispense ? (
                <Badge variant={STATUS_VARIANT[r.dispense.status] ?? "muted"}>
                  {r.dispense.status}
                </Badge>
              ) : (
                <Badge variant="warning">PREPARING</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="inline-flex items-center gap-2">
                <Link
                  href={`/visits/${r.visitId}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("pharmacy.view_visit")}
                </Link>
                {canDispense && <DispenseButton orderId={r.orderId} />}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
