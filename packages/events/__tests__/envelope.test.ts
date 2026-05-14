import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildEnvelope, envelope, EventMetadataSchema } from "../src/envelope";

const TestPayload = z.object({ message: z.string() });
const TestEnvelope = envelope(TestPayload);

describe("buildEnvelope", () => {
  it("creates an envelope with the expected metadata shape", () => {
    const env = buildEnvelope({
      eventName: "test.event",
      version: "v1",
      payload: TestPayload.parse({ message: "hello" }),
      ctx: {
        eventId: "11111111-1111-1111-1111-111111111111",
        correlationId: "22222222-2222-2222-2222-222222222222",
        tenantId: "t_test",
        branchId: "b_test",
        actor: { type: "USER", id: "u_test" },
      },
    });
    expect(env.metadata.event_name).toBe("test.event");
    expect(env.metadata.event_version).toBe("v1");
    expect(env.metadata.tenant_id).toBe("t_test");
    expect(env.metadata.branch_id).toBe("b_test");
    expect(env.payload).toEqual({ message: "hello" });
  });

  it("round-trips through the envelope schema (parse) without losing fields", () => {
    const env = buildEnvelope({
      eventName: "test.event",
      version: "v1",
      payload: TestPayload.parse({ message: "hi" }),
      ctx: {
        eventId: "11111111-1111-1111-1111-111111111111",
        correlationId: "22222222-2222-2222-2222-222222222222",
        tenantId: "t_test",
        actor: { type: "SYSTEM", id: null },
      },
    });
    const parsed = TestEnvelope.parse(env);
    expect(parsed.payload.message).toBe("hi");
    expect(parsed.metadata.actor.type).toBe("SYSTEM");
    expect(EventMetadataSchema.safeParse(env.metadata).success).toBe(true);
  });

  it("rejects metadata missing required fields", () => {
    const bad = {
      event_name: "x",
      // missing event_version, etc.
    };
    expect(EventMetadataSchema.safeParse(bad).success).toBe(false);
  });
});
