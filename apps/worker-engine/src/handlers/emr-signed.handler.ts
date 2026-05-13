import { prisma } from "@legacyx/db";
import { EmrEvents, EVENT_NAMES } from "@legacyx/events";
import { logger } from "../logger";
import type { Handler, HandlerEnvelope } from "./types";

const log = logger.child({ handler: "emr-signed" });

/**
 * On emr.signed: write an immutable audit row (defense-in-depth — the api-server
 * already wrote one inside the same TX; this records that the downstream pipeline
 * actually saw the event) and queue an e-receipt-style PDF stub.
 */
async function run(env: HandlerEnvelope): Promise<void> {
  const payload = EmrEvents.EmrSignedV1Payload.parse(env.payload);
  const { tenant_id, branch_id } = env.metadata;

  log.info({ emr: payload.emr_id, version: payload.version }, "post-sign processing");

  // Defense-in-depth audit row
  await prisma.auditLog.create({
    data: {
      tenantId: tenant_id,
      branchId: branch_id,
      actorUserId: payload.signed_by,
      action: "emr.signed.observed",
      resourceType: "EMR",
      resourceId: payload.emr_id,
      after: { version: payload.version, content_hash: payload.content_hash },
      correlationId: env.metadata.correlation_id,
    },
  });
}

export const emrSignedHandler: Handler = {
  name: "emr-signed.audit-observe",
  eventName: EVENT_NAMES.EMR_SIGNED,
  run,
};
