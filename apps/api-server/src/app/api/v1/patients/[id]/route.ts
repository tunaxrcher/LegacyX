import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse, NotFound } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "patient",
      action: "read",
      target: { branchId: ctx.branchId },
    });

    const patient = await prisma.patient.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!patient) throw NotFound(`Patient ${params.id} not found`);

    const [appointments, visits, wallets] = await Promise.all([
      prisma.appointment.findMany({
        where: { tenantId: ctx.tenantId, patientId: patient.id },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      }),
      prisma.visit.findMany({
        where: { tenantId: ctx.tenantId, patientId: patient.id },
        orderBy: { checkedInAt: "desc" },
        take: 20,
        include: { appointment: { select: { id: true, scheduledAt: true } } },
      }),
      prisma.walletAccount.findMany({
        where: { tenantId: ctx.tenantId, patientId: patient.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const productIds = wallets.map((w) => w.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    return NextResponse.json({
      data: {
        ...patient,
        appointments,
        visits,
        wallets: wallets.map((w) => ({ ...w, product: pMap.get(w.productId) ?? null })),
      },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
