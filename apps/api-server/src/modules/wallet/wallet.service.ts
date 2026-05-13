import { z } from "zod";
import { InventoryEvents, EVENT_NAMES } from "@legacyx/events";
import { BadRequest, NotFound, Conflict } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

export const PurchaseDto = z.object({
  patient_id: z.string().min(1),
  product_id: z.string().min(1),
  quantity: z.number().int().positive().max(10_000),
  expires_in_days: z.number().int().positive().max(3650).optional(),
  ref_type: z.enum(["INVOICE", "MANUAL"]).default("MANUAL"),
  ref_id: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type PurchaseInput = z.infer<typeof PurchaseDto>;

export const UseDto = z.object({
  wallet_id: z.string().min(1),
  quantity: z.number().int().positive().max(100).default(1),
  ref_type: z.literal("PROCEDURE"),
  ref_id: z.string().min(1),
  notes: z.string().max(500).optional(),
});
export type UseInput = z.infer<typeof UseDto>;

export const ReverseDto = z.object({
  ledger_id: z.string().min(1),
  reason: z.string().min(3).max(500),
});
export type ReverseInput = z.infer<typeof ReverseDto>;

export async function purchaseWallet(ctx: RequestContext, input: PurchaseInput) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: input.patient_id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);
    if (patient.status !== "ACTIVE") throw BadRequest("Patient is not active");

    const product = await tx.product.findFirst({
      where: { id: input.product_id, tenantId: ctx.tenantId },
      select: { id: true, category: true, name: true },
    });
    if (!product) throw NotFound(`Product ${input.product_id} not found`);
    if (product.category !== "COURSE") throw BadRequest("Product is not a COURSE package");

    // Find or create wallet account for this (patient, product)
    let wallet = await tx.walletAccount.findFirst({
      where: {
        tenantId: ctx.tenantId,
        patientId: patient.id,
        productId: product.id,
      },
    });
    const expiresAt = input.expires_in_days
      ? new Date(Date.now() + input.expires_in_days * 86400_000)
      : null;
    if (!wallet) {
      wallet = await tx.walletAccount.create({
        data: {
          tenantId: ctx.tenantId,
          patientId: patient.id,
          productId: product.id,
          balance: 0,
          expiresAt,
        },
      });
    } else if (expiresAt && (!wallet.expiresAt || expiresAt > wallet.expiresAt)) {
      wallet = await tx.walletAccount.update({
        where: { id: wallet.id },
        data: { expiresAt },
      });
    }

    const balanceAfter = wallet.balance + input.quantity;

    const ledger = await tx.walletLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        walletId: wallet.id,
        patientId: patient.id,
        entryType: "PURCHASE",
        delta: input.quantity,
        balanceAfter,
        refType: input.ref_type,
        refId: input.ref_id ?? "manual",
        notes: input.notes,
        createdBy: ctx.actor.id,
      },
    });

    await tx.walletAccount.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    return {
      result: { wallet, ledger },
      events: [
        {
          eventName: EVENT_NAMES.WALLET_PURCHASED,
          payload: InventoryEvents.WalletPurchasedV1Payload.parse({
            wallet_id: wallet.id,
            patient_id: patient.id,
            product_id: product.id,
            delta: input.quantity,
            ref_type: input.ref_type,
            ref_id: input.ref_id ?? "manual",
            balance_after: balanceAfter,
            expires_at: (expiresAt ?? wallet.expiresAt)?.toISOString(),
          }),
        },
      ],
    };
  });
}

export async function useWallet(ctx: RequestContext, input: UseInput) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const wallet = await tx.walletAccount.findFirst({
      where: { id: input.wallet_id, tenantId: ctx.tenantId },
    });
    if (!wallet) throw NotFound(`Wallet ${input.wallet_id} not found`);
    if (wallet.expiresAt && wallet.expiresAt < new Date()) {
      throw Conflict("Wallet has expired");
    }
    if (wallet.balance < input.quantity) {
      throw Conflict(`Insufficient wallet balance (${wallet.balance} < ${input.quantity})`);
    }

    const delta = -input.quantity;
    const balanceAfter = wallet.balance + delta;

    const ledger = await tx.walletLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        walletId: wallet.id,
        patientId: wallet.patientId,
        entryType: "USE",
        delta,
        balanceAfter,
        refType: input.ref_type,
        refId: input.ref_id,
        notes: input.notes,
        createdBy: ctx.actor.id,
      },
    });

    await tx.walletAccount.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    return {
      result: { wallet, ledger },
      events: [
        {
          eventName: EVENT_NAMES.WALLET_USED,
          payload: InventoryEvents.WalletUsedV1Payload.parse({
            wallet_id: wallet.id,
            patient_id: wallet.patientId,
            delta,
            ref_type: input.ref_type,
            ref_id: input.ref_id,
            balance_after: balanceAfter,
          }),
        },
      ],
    };
  });
}

export async function reverseWallet(ctx: RequestContext, input: ReverseInput) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });

  return writeWithOutbox(ctx, async (tx) => {
    const original = await tx.walletLedger.findFirst({
      where: { id: input.ledger_id, tenantId: ctx.tenantId },
    });
    if (!original) throw NotFound(`Ledger entry ${input.ledger_id} not found`);
    if (original.entryType !== "USE") throw Conflict("Only USE entries can be reversed");

    // Prevent double reversal
    const existing = await tx.walletLedger.findFirst({
      where: { reversalOfId: original.id, tenantId: ctx.tenantId },
    });
    if (existing) throw Conflict("Entry already reversed");

    const wallet = await tx.walletAccount.findUniqueOrThrow({
      where: { id: original.walletId },
    });
    const delta = -original.delta; // original is negative, so +
    const balanceAfter = wallet.balance + delta;

    const ledger = await tx.walletLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        walletId: wallet.id,
        patientId: wallet.patientId,
        entryType: "REVERSAL",
        delta,
        balanceAfter,
        refType: original.refType,
        refId: original.refId,
        reversalOfId: original.id,
        notes: input.reason,
        createdBy: ctx.actor.id,
      },
    });

    await tx.walletAccount.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    return {
      result: { wallet, ledger },
      events: [
        {
          eventName: EVENT_NAMES.WALLET_REVERSED,
          payload: InventoryEvents.WalletReversedV1Payload.parse({
            wallet_id: wallet.id,
            reversal_of_id: original.id,
            delta,
            balance_after: balanceAfter,
            reason: input.reason,
          }),
        },
      ],
    };
  });
}
