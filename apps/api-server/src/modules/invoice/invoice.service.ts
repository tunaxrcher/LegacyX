import { z } from "zod";
import { Prisma } from "@legacyx/db";
import { PaymentEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

const decString = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v));

export const CreateInvoiceFromOrderDto = z.object({
  order_id: z.string().min(1),
  discount: decString.optional(),
  tax: decString.optional(),
});

export const CreatePaymentDto = z.object({
  invoice_id: z.string().min(1),
  method: z.enum(["CASH", "CARD", "QR_PROMPTPAY", "TRANSFER", "WALLET", "OTHER"]),
  amount: decString,
  gateway: z.string().optional(),
  gateway_ref: z.string().optional(),
  /**
   * For CASH/CARD/WALLET we auto-COMPLETE inline.
   * For QR_PROMPTPAY/TRANSFER we keep AUTHORIZED until gateway webhook
   * (or until /complete is called manually).
   */
  auto_complete: z.boolean().optional(),
});

export const RefundPaymentDto = z.object({
  amount: decString.optional(), // partial refund supported; defaults to full
  reason: z.string().min(3).max(500),
});

export const VoidInvoiceDto = z.object({ reason: z.string().min(3).max(500) });

async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  // Simple incrementing number per tenant: INV-YYYY-XXXXXX
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const last = await tx.invoice.findFirst({
    where: { tenantId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastSeq = last ? Number(last.number.slice(prefix.length)) : 0;
  const next = (lastSeq + 1).toString().padStart(6, "0");
  return `${prefix}${next}`;
}

export async function createInvoiceFromOrder(
  ctx: RequestContext,
  input: z.infer<typeof CreateInvoiceFromOrderDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "payment",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.order_id, tenantId: ctx.tenantId },
      include: { items: true },
    });
    if (!order) throw NotFound(`Order ${input.order_id} not found`);
    if (order.status === "CANCELLED") throw Conflict("Order is cancelled");

    // One invoice per order (idempotent)
    const existing = await tx.invoice.findFirst({
      where: { tenantId: ctx.tenantId, orderId: order.id },
    });
    if (existing) {
      if (existing.status === "VOIDED") {
        throw Conflict("Existing invoice for this order is voided");
      }
      return { result: existing, events: [] };
    }

    const subtotal = order.items.reduce(
      (s, it) => s.add(it.total),
      new Prisma.Decimal(0),
    );
    const discount = input.discount ?? new Prisma.Decimal(0);
    const tax = input.tax ?? new Prisma.Decimal(0);
    const total = subtotal.sub(discount).add(tax);
    const number = await nextInvoiceNumber(tx, ctx.tenantId);

    const invoice = await tx.invoice.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        patientId: order.patientId,
        visitId: order.visitId,
        orderId: order.id,
        number,
        status: "ISSUED",
        subtotal,
        discount,
        tax,
        total,
        currency: "THB",
        issuedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "invoice.create",
        resourceType: "Invoice",
        resourceId: invoice.id,
        correlationId: ctx.correlationId,
        after: { number, total: total.toString() } as object,
      },
    });

    return {
      result: invoice,
      events: [
        {
          eventName: EVENT_NAMES.INVOICE_CREATED,
          payload: PaymentEvents.InvoiceCreatedV1Payload.parse({
            invoice_id: invoice.id,
            number: invoice.number,
            patient_id: invoice.patientId,
            visit_id: invoice.visitId,
            order_id: invoice.orderId,
            total: total.toString(),
            status: "ISSUED",
          }),
        },
      ],
    };
  });
}

export async function voidInvoice(
  ctx: RequestContext,
  invoiceId: string,
  reason: string,
) {
  await authorize(ctx, {
    resource: "invoice",
    action: "void",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;
  return writeWithOutbox(ctx, async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, tenantId: ctx.tenantId },
      include: { payments: true },
    });
    if (!inv) throw NotFound(`Invoice ${invoiceId} not found`);
    if (inv.status === "VOIDED") throw Conflict("Already voided");
    if (inv.status === "PAID") {
      throw Conflict("Cannot void a paid invoice — issue a refund instead");
    }
    const hasNonRefundedPayments = inv.payments.some(
      (p) => p.state === "COMPLETED" || p.state === "SETTLED",
    );
    if (hasNonRefundedPayments) {
      throw Conflict("Cannot void — refund completed payments first");
    }

    const updated = await tx.invoice.update({
      where: { id: inv.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "invoice.void",
        resourceType: "Invoice",
        resourceId: inv.id,
        reason,
        correlationId: ctx.correlationId,
      },
    });

    return {
      result: updated,
      events: [
        {
          eventName: EVENT_NAMES.INVOICE_VOIDED,
          payload: PaymentEvents.InvoiceVoidedV1Payload.parse({
            invoice_id: inv.id,
            voided_by: actorId,
            reason,
          }),
        },
      ],
    };
  });
}

export async function createPayment(
  ctx: RequestContext,
  input: z.infer<typeof CreatePaymentDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "payment",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: input.invoice_id, tenantId: ctx.tenantId },
      include: {
        payments: true,
        order: { include: { items: true } },
      },
    });
    if (!inv) throw NotFound(`Invoice ${input.invoice_id} not found`);
    if (inv.status === "VOIDED") throw Conflict("Invoice voided");
    if (inv.status === "PAID") throw Conflict("Invoice already paid");
    if (input.amount.lte(0)) throw BadRequest("Amount must be positive");

    // Check remaining due
    const paid = inv.payments
      .filter((p) => p.state === "COMPLETED" || p.state === "SETTLED")
      .reduce((s, p) => s.add(p.amount), new Prisma.Decimal(0));
    const refunded = inv.payments
      .filter((p) => p.state === "REFUNDED")
      .reduce((s, p) => s.add(p.amount), new Prisma.Decimal(0));
    const due = inv.total.sub(paid).add(refunded);
    if (input.amount.gt(due)) {
      throw Conflict(`Amount ${input.amount} exceeds due ${due.toString()}`);
    }

    const autoComplete =
      input.auto_complete ??
      ["CASH", "CARD", "WALLET", "OTHER"].includes(input.method);

    const now = new Date();
    const payment = await tx.payment.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId!,
        invoiceId: inv.id,
        method: input.method,
        state: autoComplete ? "COMPLETED" : "AUTHORIZED",
        amount: input.amount,
        currency: inv.currency,
        gateway: input.gateway,
        gatewayRef: input.gateway_ref,
        authorizedAt: now,
        completedAt: autoComplete ? now : null,
      },
    });

    const events: Array<{ eventName: string; payload: unknown }> = [
      {
        eventName: EVENT_NAMES.PAYMENT_AUTHORIZED,
        payload: PaymentEvents.PaymentAuthorizedV1Payload.parse({
          payment_id: payment.id,
          invoice_id: inv.id,
          amount: input.amount.toString(),
          method: input.method,
          gateway: input.gateway,
          gateway_ref: input.gateway_ref,
        }),
      },
    ];

    let invoiceFullyPaid = false;
    if (autoComplete) {
      const newPaid = paid.add(input.amount);
      invoiceFullyPaid = newPaid.gte(inv.total);
      events.push({
        eventName: EVENT_NAMES.PAYMENT_COMPLETED,
        payload: PaymentEvents.PaymentCompletedV1Payload.parse({
          payment_id: payment.id,
          invoice_id: inv.id,
          patient_id: inv.patientId,
          amount: input.amount.toString(),
          method: input.method,
          completed_at: now.toISOString(),
          items_summary:
            inv.order?.items.map((it) => ({
              type: it.itemType,
              ref_id: it.refId,
              qty: it.qty.toString(),
              total: it.total.toString(),
            })) ?? [],
        }),
      });

      // Flip invoice status: PAID / PARTIAL
      const nextStatus = invoiceFullyPaid ? "PAID" : "PARTIAL";
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: nextStatus },
      });
      if (invoiceFullyPaid) {
        events.push({
          eventName: EVENT_NAMES.INVOICE_PAID,
          payload: PaymentEvents.InvoicePaidV1Payload.parse({
            invoice_id: inv.id,
            patient_id: inv.patientId,
            total: inv.total.toString(),
            paid_at: now.toISOString(),
          }),
        });

        // Auto-generate an E_RECEIPT Document → emits document.requested
        const doc = await tx.document.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            type: "E_RECEIPT",
            refType: "INVOICE",
            refId: inv.id,
            templateCode: "e_receipt.basic",
            templateVersion: "v1",
            storageKey: "", // populated by worker
            contentHash: "",
            status: "REQUESTED",
            generatedBy: "system",
          },
        });
        events.push({
          eventName: EVENT_NAMES.DOCUMENT_REQUESTED,
          payload: PaymentEvents.DocumentRequestedV1Payload.parse({
            document_id: doc.id,
            type: "E_RECEIPT",
            template_code: "e_receipt.basic",
            template_version: "v1",
            ref_type: "INVOICE",
            ref_id: inv.id,
            data: {
              invoice_number: inv.number,
              total: inv.total.toString(),
              currency: inv.currency,
              method: input.method,
              paid_at: now.toISOString(),
            },
          }),
        });
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "payment.create",
        resourceType: "Payment",
        resourceId: payment.id,
        correlationId: ctx.correlationId,
        after: {
          state: payment.state,
          amount: input.amount.toString(),
        } as object,
      },
    });

    return { result: { payment, invoiceFullyPaid }, events };
  });
}

export async function completePayment(ctx: RequestContext, paymentId: string) {
  await authorize(ctx, {
    resource: "payment",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  return writeWithOutbox(ctx, async (tx) => {
    const p = await tx.payment.findFirst({
      where: { id: paymentId, tenantId: ctx.tenantId },
      include: {
        invoice: { include: { payments: true, order: { include: { items: true } } } },
      },
    });
    if (!p) throw NotFound(`Payment ${paymentId} not found`);
    if (p.state === "COMPLETED" || p.state === "SETTLED")
      throw Conflict("Already completed");
    if (p.state !== "AUTHORIZED") throw Conflict(`Cannot complete from ${p.state}`);

    const now = new Date();
    const updated = await tx.payment.update({
      where: { id: p.id },
      data: { state: "COMPLETED", completedAt: now },
    });

    // Recompute paid sum
    const paidSum = p.invoice.payments
      .filter((x) => x.id !== p.id && (x.state === "COMPLETED" || x.state === "SETTLED"))
      .reduce((s, x) => s.add(x.amount), new Prisma.Decimal(0))
      .add(p.amount);
    const fullyPaid = paidSum.gte(p.invoice.total);
    await tx.invoice.update({
      where: { id: p.invoice.id },
      data: { status: fullyPaid ? "PAID" : "PARTIAL" },
    });

    const events: Array<{ eventName: string; payload: unknown }> = [
      {
        eventName: EVENT_NAMES.PAYMENT_COMPLETED,
        payload: PaymentEvents.PaymentCompletedV1Payload.parse({
          payment_id: p.id,
          invoice_id: p.invoice.id,
          patient_id: p.invoice.patientId,
          amount: p.amount.toString(),
          method: p.method,
          completed_at: now.toISOString(),
          items_summary:
            p.invoice.order?.items.map((it) => ({
              type: it.itemType,
              ref_id: it.refId,
              qty: it.qty.toString(),
              total: it.total.toString(),
            })) ?? [],
        }),
      },
    ];
    if (fullyPaid) {
      events.push({
        eventName: EVENT_NAMES.INVOICE_PAID,
        payload: PaymentEvents.InvoicePaidV1Payload.parse({
          invoice_id: p.invoice.id,
          patient_id: p.invoice.patientId,
          total: p.invoice.total.toString(),
          paid_at: now.toISOString(),
        }),
      });
    }
    return { result: updated, events };
  });
}

export async function refundPayment(
  ctx: RequestContext,
  paymentId: string,
  input: z.infer<typeof RefundPaymentDto>,
) {
  if (!ctx.branchId) throw BadRequest("Branch context required");
  await authorize(ctx, {
    resource: "payment",
    action: "void",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");
  const actorId: string = ctx.actor.id;

  return writeWithOutbox(ctx, async (tx) => {
    const orig = await tx.payment.findFirst({
      where: { id: paymentId, tenantId: ctx.tenantId },
      include: { invoice: true },
    });
    if (!orig) throw NotFound(`Payment ${paymentId} not found`);
    if (orig.state !== "COMPLETED" && orig.state !== "SETTLED") {
      throw Conflict(`Cannot refund payment in state ${orig.state}`);
    }

    // Cumulative refund guard — partial refunds may be issued multiple times
    // (each one creates a compensating row with refundOfId = orig.id and a
    // negative amount). The CAP is the original amount, not whatever's left
    // after the last refund. Re-fetching here in the same TX is critical so
    // a concurrent refund can't slip past the check.
    const priorRefunds = await tx.payment.findMany({
      where: { refundOfId: orig.id, state: "REFUNDED" },
      select: { amount: true },
    });
    const alreadyRefunded = priorRefunds.reduce(
      (s, r) => s.add(r.amount.abs()),
      new Prisma.Decimal(0),
    );
    const refundable = orig.amount.sub(alreadyRefunded);

    const amount = input.amount ?? refundable;
    if (amount.lte(0)) {
      throw BadRequest("Refund amount must be positive");
    }
    if (amount.gt(refundable)) {
      throw BadRequest(
        `Refund amount ${amount.toString()} exceeds remaining refundable ${refundable.toString()} (orig ${orig.amount.toString()} - already refunded ${alreadyRefunded.toString()})`,
      );
    }

    const now = new Date();
    // Flip original to REFUNDED only when the cumulative refund equals the
    // original amount — at THAT point the row is fully compensated. A second
    // partial refund that exactly drains the remaining balance must also
    // close the original out, so we compare against `refundable`.
    const fullRefund = amount.eq(refundable);
    if (fullRefund) {
      await tx.payment.update({
        where: { id: orig.id },
        data: { state: "REFUNDED", refundedAt: now, failureReason: input.reason },
      });
    }

    // Create compensating refund row (negative amount)
    const refundRow = await tx.payment.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: orig.branchId,
        invoiceId: orig.invoiceId,
        method: orig.method,
        state: "REFUNDED",
        amount: amount.negated(),
        currency: orig.currency,
        gateway: orig.gateway,
        gatewayRef: orig.gatewayRef,
        refundOfId: orig.id,
        authorizedAt: now,
        refundedAt: now,
        failureReason: input.reason,
      },
    });

    // Recompute invoice status
    const allPayments = await tx.payment.findMany({
      where: { invoiceId: orig.invoiceId },
    });
    const netPaid = allPayments
      .filter((x) => x.state === "COMPLETED" || x.state === "SETTLED")
      .reduce((s, x) => s.add(x.amount), new Prisma.Decimal(0))
      .add(
        allPayments
          .filter((x) => x.state === "REFUNDED")
          .reduce((s, x) => s.add(x.amount), new Prisma.Decimal(0)),
      );
    const inv = orig.invoice;
    const newStatus = netPaid.gte(inv.total)
      ? "PAID"
      : netPaid.gt(0)
        ? "PARTIAL"
        : "ISSUED";
    await tx.invoice.update({
      where: { id: inv.id },
      data: { status: newStatus },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: actorId,
        action: "payment.refund",
        resourceType: "Payment",
        resourceId: orig.id,
        reason: input.reason,
        correlationId: ctx.correlationId,
        after: {
          refund_payment_id: refundRow.id,
          amount: amount.toString(),
        } as object,
      },
    });

    return {
      result: { original: orig, refund: refundRow, invoiceStatus: newStatus },
      events: [
        {
          eventName: EVENT_NAMES.PAYMENT_REFUNDED,
          payload: PaymentEvents.PaymentRefundedV1Payload.parse({
            payment_id: orig.id,
            refund_payment_id: refundRow.id,
            amount: amount.toString(),
            reason: input.reason,
          }),
        },
      ],
    };
  });
}
