import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "../../../../../shared/context";
import { BadRequest, toErrorResponse } from "../../../../../shared/errors";
import {
  ExpiringQueryDto,
  ReportPeriodDto,
  reportDoctorProductivity,
  reportInventoryExpiring,
  reportPatientRetention,
  reportRevenueTrend,
  reportServiceProfitability,
} from "../../../../../modules/report/report.service";
import { buildReportWorkbook } from "../../../../../modules/report/report.excel";

export const dynamic = "force-dynamic";

type ReportName =
  | "doctor-productivity"
  | "service-profitability"
  | "patient-retention"
  | "revenue-trend"
  | "inventory-expiring";

const PERIOD_REPORTS: ReportName[] = [
  "doctor-productivity",
  "service-profitability",
  "patient-retention",
  "revenue-trend",
];

export async function GET(
  req: Request,
  { params }: { params: { name: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    if (format !== "json" && format !== "xlsx") {
      throw BadRequest("format must be `json` or `xlsx`");
    }

    const name = params.name as ReportName;

    if (PERIOD_REPORTS.includes(name)) {
      const period = ReportPeriodDto.parse({
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });
      const meta = { Period: `${period.from} → ${period.to}` };

      switch (name) {
        case "doctor-productivity": {
          const data = await reportDoctorProductivity(ctx, period);
          if (format === "xlsx") {
            const buf = await buildReportWorkbook({
              sheetName: "Doctor productivity",
              headers: ["Doctor", "Visits", "Procedures", "Revenue (THB)"],
              rows: data.map((r) => [r.doctorName, r.visits, r.procedures, r.revenue]),
              meta,
            });
            return excelResponse(buf, `doctor-productivity-${period.from}_${period.to}`);
          }
          return NextResponse.json({ data, correlation_id: correlationId });
        }
        case "service-profitability": {
          const data = await reportServiceProfitability(ctx, period);
          if (format === "xlsx") {
            const buf = await buildReportWorkbook({
              sheetName: "Service profitability",
              headers: [
                "Service code",
                "Service name",
                "Units sold",
                "Revenue",
                "COGS",
                "Margin",
              ],
              rows: data.map((r) => [
                r.serviceCode,
                r.serviceName,
                r.unitsSold,
                r.revenue,
                r.cogs,
                r.margin,
              ]),
              meta,
            });
            return excelResponse(buf, `service-profitability-${period.from}_${period.to}`);
          }
          return NextResponse.json({ data, correlation_id: correlationId });
        }
        case "patient-retention": {
          const data = await reportPatientRetention(ctx, period);
          if (format === "xlsx") {
            const buf = await buildReportWorkbook({
              sheetName: "Patient retention",
              headers: [
                "Cohort month",
                "New patients",
                "Returned ≥1",
                "Returned ≥2",
                "Returned ≥5",
              ],
              rows: data.map((r) => [
                r.cohortMonth,
                r.newPatients,
                r.returnedAtLeastOnce,
                r.returnedAtLeastTwice,
                r.returnedAtLeastFiveTimes,
              ]),
              meta,
            });
            return excelResponse(buf, `patient-retention-${period.from}_${period.to}`);
          }
          return NextResponse.json({ data, correlation_id: correlationId });
        }
        case "revenue-trend": {
          const data = await reportRevenueTrend(ctx, period);
          if (format === "xlsx") {
            const buf = await buildReportWorkbook({
              sheetName: "Revenue trend",
              headers: ["Date", "Total", "Cash", "Card", "QR", "Transfer", "Wallet", "Other"],
              rows: data.map((r) => [
                r.date,
                r.total,
                r.cash,
                r.card,
                r.qr,
                r.transfer,
                r.wallet,
                r.other,
              ]),
              meta,
            });
            return excelResponse(buf, `revenue-trend-${period.from}_${period.to}`);
          }
          return NextResponse.json({ data, correlation_id: correlationId });
        }
      }
    }

    if (name === "inventory-expiring") {
      const q = ExpiringQueryDto.parse({
        withinDays: url.searchParams.get("withinDays") ?? undefined,
      });
      const data = await reportInventoryExpiring(ctx, q);
      if (format === "xlsx") {
        const buf = await buildReportWorkbook({
          sheetName: "Inventory expiring",
          headers: ["SKU", "Name", "Lot", "On hand", "Expires at", "Days left"],
          rows: data.map((r) => [
            r.sku,
            r.name,
            r.lotNo,
            r.quantityOnHand,
            r.expiresAt,
            r.daysUntilExpiry,
          ]),
          meta: { Window: `Within ${q.withinDays} days` },
        });
        return excelResponse(buf, `inventory-expiring-${q.withinDays}d`);
      }
      return NextResponse.json({ data, correlation_id: correlationId });
    }

    throw BadRequest(`Unknown report '${name}'`);
  } catch (err) {
    if (err instanceof z.ZodError) return toErrorResponse(err, correlationId);
    return toErrorResponse(err, correlationId);
  }
}

function excelResponse(buf: Buffer, filenameStem: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filenameStem}.xlsx"`,
    },
  });
}
