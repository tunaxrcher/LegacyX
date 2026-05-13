import type { EventMetadata } from "@legacyx/events";

export type HandlerEnvelope<T = unknown> = {
  metadata: EventMetadata;
  payload: T;
};

export type Handler = {
  name: string;
  eventName: string;
  run: (env: HandlerEnvelope) => Promise<void>;
};
