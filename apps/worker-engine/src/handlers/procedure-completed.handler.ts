import { Prisma, prisma } from "@legacyx/db";
import {
  InventoryEvents,
  EVENT_NAMES,
  buildEnvelope,
} from "@legacyx/events";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const newEventId = () => randomUUID();

const log = logger.child({ handler: "procedure-completed" });

/**
 * Reaction to `procedure.completed`:
 *   1. Look up the BOM for the procedure code (ownerType=PROCEDURE, ownerRef=code).
 *   2. For each BOM component, append an immutable StockLedger BOM_USAGE row
 *      (running balance derived from last entry for that product+branch).
 *   3. Emit a single aggregated `inventory.adjusted` event via the outbox
 *      so any downstream subscribers (e.g. reorder, analytics) see it.
 *
 * Idempotency is provided by the worker's ProcessedEvent table (see worker.ts).
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = InventoryEvents.ProcedureCompletedV1Payload.parse(env.payload);
  const { tenant_id, branch_id, correlation_id, event_id } = env.metadata;
  if (!branch_id) throw new Error("branch_id required for procedure.completed");

  log.info(
    { procedure_id: payload.procedure_id, code: payload.procedure_code },
    "processing",
  );

  const bom = await prisma.bOM.findFirst({
    where: {
      tenantId: tenant_id,
      ownerType: "PROCEDURE",
      ownerRef: payload.procedure_code,
      active: true,
    },
    orderBy: { version: "desc" },
    include: { items: true },
  });

  if (!bom || bom.items.length === 0) {
    log.warn(
      { procedure_code: payload.procedure_code },
      "no active BOM for procedure — skipping inventory consume",
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    const ledgerIds: string[] = [];
    const productChanges: Array<{
      product_id: string;
      delta: string;
      balance_after: string;
    }> = [];

    for (const item of bom.items) {
      // Fetch last balance for product in this branch
      const last = await tx.stockLedger.findFirst({
        where: {
          tenantId: tenant_id,
          branchId: branch_id,
          productId: item.componentProductId,
        },
        orderBy: { createdAt: "desc" },
        select: { balanceAfter: true },
      });
      const prev = last?.balanceAfter ?? new Prisma.Decimal(0);
      const delta = item.qty.negated(); // consume → negative
      const balanceAfter = prev.add(delta);

      const created = await tx.stockLedger.create({
        data: {
          tenantId: tenant_id,
          branchId: branch_id,
          productId: item.componentProductId,
          entryType: "BOM_USAGE",
          qty: delta,
          balanceAfter,
          refType: "PROCEDURE",
          refId: payload.procedure_id,
          notes: `BOM consume for ${payload.procedure_code}`,
          createdBy: payload.performed_by,
        },
      });
      ledgerIds.push(created.id);
      productChanges.push({
        product_id: item.componentProductId,
        delta: delta.toString(),
        balance_after: balanceAfter.toString(),
      });
    }

    // Emit aggregated inventory.adjusted via outbox
    const adjustedEventId = newEventId();
    const envelope = buildEnvelope({
      eventName: EVENT_NAMES.INVENTORY_ADJUSTED,
      version: "v1",
      payload: InventoryEvents.InventoryAdjustedV1Payload.parse({
        ledger_ids: ledgerIds,
        ref_type: "PROCEDURE",
        ref_id: payload.procedure_id,
        product_changes: productChanges,
      }),
      ctx: {
        eventId: adjustedEventId,
        correlationId: correlation_id,
        causationId: event_id,
        tenantId: tenant_id,
        branchId: branch_id,
        actor: { type: "SYSTEM", id: payload.performed_by },
      },
    });

    await tx.outboxEvent.create({
      data: {
        eventId: adjustedEventId,
        eventName: envelope.metadata.event_name,
        eventVersion: envelope.metadata.event_version,
        correlationId: envelope.metadata.correlation_id,
        causationId: envelope.metadata.causation_id,
        tenantId: envelope.metadata.tenant_id,
        branchId: envelope.metadata.branch_id,
        payload: envelope.payload as Prisma.InputJsonValue,
        metadata: envelope.metadata as unknown as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });

    log.info(
      { procedure_id: payload.procedure_id, items_consumed: bom.items.length },
      "BOM consumed and inventory.adjusted emitted",
    );
  });
}

export const procedureCompletedHandler: Handler = {
  name: "procedure-completed.bom-consume",
  eventName: EVENT_NAMES.PROCEDURE_COMPLETED,
  run,
};
