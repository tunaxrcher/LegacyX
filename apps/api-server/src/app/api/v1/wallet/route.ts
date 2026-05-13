import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse, BadRequest } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";

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
    const patientId = url.searchParams.get("patient_id");
    if (!patientId) throw BadRequest("patient_id query parameter required");

    const accounts = await prisma.walletAccount.findMany({
      where: { tenantId: ctx.tenantId, patientId },
      orderBy: { createdAt: "desc" },
      include: {
        entries: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    const productIds = accounts.map((a) => a.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, unit: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    return NextResponse.json({
      data: accounts.map((a) => ({
        ...a,
        product: pMap.get(a.productId) ?? null,
      })),
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
