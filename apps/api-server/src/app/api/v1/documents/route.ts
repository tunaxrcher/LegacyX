import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";
import { RequestDocumentDto, requestDocument } from "../../../../modules/document/document.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "patient",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    const url = new URL(req.url);
    const refType = url.searchParams.get("ref_type");
    const refId = url.searchParams.get("ref_id");
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (refType) where.refType = refType;
    if (refId) where.refId = refId;

    const rows = await prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ data: rows, correlation_id: ctx.correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = RequestDocumentDto.parse(body);
    const result = await requestDocument(ctx, dto);
    return NextResponse.json(
      { data: result, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
