import type { Handler } from "./types";
import { appointmentCreatedHandler } from "./appointment-created.handler";
import { emrSignedHandler } from "./emr-signed.handler";
import { procedureCompletedHandler } from "./procedure-completed.handler";
import { documentRequestedHandler } from "./document-requested.handler";

const all: Handler[] = [
  appointmentCreatedHandler,
  emrSignedHandler,
  procedureCompletedHandler,
  documentRequestedHandler,
];

/** Map: event_name → handlers subscribed to it (multi-handler ready). */
export const handlerRegistry = new Map<string, Handler[]>();
for (const h of all) {
  const arr = handlerRegistry.get(h.eventName) ?? [];
  arr.push(h);
  handlerRegistry.set(h.eventName, arr);
}

export { all as handlers };
