import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  UpdatePatientDto,
  updatePatient,
  getPatientDetail,
} from "../../../../../modules/patient/patient.service";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = UpdatePatientDto.parse(body);
    const updated = await updatePatient(ctx, params.id, dto);
    return NextResponse.json({ data: updated, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;

    // Decrypted PII fields handled by the service layer.
    const detail = await getPatientDetail(ctx, params.id);

    const [appointments, visits, wallets] = await Promise.all([
      prisma.appointment.findMany({
        where: { tenantId: ctx.tenantId, patientId: detail.id },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      }),
      prisma.visit.findMany({
        where: { tenantId: ctx.tenantId, patientId: detail.id },
        orderBy: { checkedInAt: "desc" },
        take: 20,
        include: { appointment: { select: { id: true, scheduledAt: true } } },
      }),
      prisma.walletAccount.findMany({
        where: { tenantId: ctx.tenantId, patientId: detail.id },
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
        ...detail,
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
