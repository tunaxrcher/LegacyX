import { prisma } from "@legacyx/db";
import { EodEvents, EVENT_NAMES } from "@legacyx/events";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "payment-settled" });

function exportRoot() {
  return process.env.ACCOUNTING_EXPORT_DIR
    ?? path.resolve(process.cwd(), "../../storage/accounting");
}

/**
 * Reaction to `payment.settled`:
 *   1. Append a CSV row to `storage/accounting/<tenant>/<yyyy-mm>/settlement.csv`
 *      (production should swap this for an SFTP/API push to the accounting
 *      system — interface is identical).
 *   2. Insert an audit log row referencing the settlement batch so finance
 *      teams can drill back to the originating payment.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = EodEvents.PaymentSettledV1Payload.parse(env.payload);
  const { tenant_id, branch_id, correlation_id } = env.metadata;

  log.info(
    {
      payment_id: payload.payment_id,
      batch: payload.gateway_settlement_id,
      amount: payload.amount,
    },
    "exporting to accounting",
  );

  const settledAt = new Date(payload.settled_at);
  const ym = `${settledAt.getFullYear()}-${String(settledAt.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(exportRoot(), tenant_id, ym);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "settlement.csv");

  const row = [
    payload.settled_at,
    payload.gateway_settlement_id,
    payload.payment_id,
    payload.invoice_id,
    payload.method,
    payload.amount,
    payload.fee_amount ?? "",
    payload.net_amount ?? payload.amount,
    branch_id ?? "",
    correlation_id,
  ]
    .map((v) => String(v).replace(/"/g, '""'))
    .map((v) => (v.includes(",") ? `"${v}"` : v))
    .join(",");

  await appendFile(file, row + "\n", { encoding: "utf8" });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id ?? null,
      actorUserId: null,
      action: "accounting.export",
      resourceType: "Payment",
      resourceId: payload.payment_id,
      correlationId: correlation_id,
      after: {
        batch_id: payload.gateway_settlement_id,
        amount: payload.amount,
        fee_amount: payload.fee_amount,
        export_file: file,
      } as object,
    },
  });

  log.info({ file }, "settlement row appended");
}

export const paymentSettledHandler: Handler = {
  name: "payment-settled.accounting-export",
  eventName: EVENT_NAMES.PAYMENT_SETTLED,
  run,
};
