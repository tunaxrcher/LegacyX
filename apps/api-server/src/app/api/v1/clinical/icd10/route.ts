import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";
import { searchIcd10 } from "../../../../../modules/clinical/icd10-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    // Any clinician (DOCTOR / NURSE) plus MANAGER may search ICD-10 — gate
    // on the same `emr:read` grant that already covers the EMR diagnosis tab.
    await authorize(ctx, { resource: "emr", action: "read" });
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
    const data = searchIcd10(q, limit);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
