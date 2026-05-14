import type { Handler } from "./types";
import { appointmentCreatedHandler } from "./appointment-created.handler";
import { emrSignedHandler } from "./emr-signed.handler";
import { procedureCompletedHandler } from "./procedure-completed.handler";
import { documentRequestedHandler } from "./document-requested.handler";
import { paymentSettledHandler } from "./payment-settled.handler";
import { shiftClosedHandler } from "./shift-closed.handler";
import { inventoryReconciledHandler } from "./inventory-reconciled.handler";
import { consentSignedHandler } from "./consent-signed.handler";
import { documentGeneratedHandler } from "./document-generated.handler";
import { labResultedHandler } from "./lab-resulted.handler";

const all: Handler[] = [
  appointmentCreatedHandler,
  emrSignedHandler,
  procedureCompletedHandler,
  documentRequestedHandler,
  documentGeneratedHandler,
  paymentSettledHandler,
  shiftClosedHandler,
  inventoryReconciledHandler,
  consentSignedHandler,
  labResultedHandler,
];

/** Map: event_name → handlers subscribed to it (multi-handler ready). */
export const handlerRegistry = new Map<string, Handler[]>();
for (const h of all) {
  const arr = handlerRegistry.get(h.eventName) ?? [];
  arr.push(h);
  handlerRegistry.set(h.eventName, arr);
}
