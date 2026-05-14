import { headers } from "next/headers";
import { ulid } from "ulid";
import { prisma } from "@legacyx/db";
import { verifyPatientJwt } from "./jwt";
import { ContextError } from "./context";

/**
 * Per-request context for the **patient app** (LIFF/PWA).
 *
 * Distinct from the staff `RequestContext` because:
 *   - Authentication is via patient JWT (HS256) — see `jwt.ts`.
 *   - Actor is the patient, not a staff user. ABAC `authorize()` is bypassed
 *     entirely; instead we hand-write narrow patient-scoped queries that always
 *     include `patientId === ctx.patientId`.
 *   - Branch is *chosen* by the patient (per request), not pinned to a session.
 */
export type PatientRequestContext = {
  correlationId: string;
  tenantId: string;
  patientId: string;
  /** Optional branch chosen for this request (e.g. when listing slots/booking). */
  branchId?: string;
  /** LINE user id snapshot (for audit/tracking). */
  lineUserId?: string;
};

export async function getPatientContext(): Promise<PatientRequestContext> {
  const h = headers();
  const correlationId = h.get("x-correlation-id") ?? ulid();

  const auth = h.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    throw new ContextError("Missing patient bearer token", 401);
  }
  const payload = verifyPatientJwt(token);
  if (!payload) {
    throw new ContextError("Invalid or expired patient session", 401);
  }

  // Confirm the patient still exists + is active. This is the one DB hit we
  // pay per request — it's worth it because a soft-deleted/merged patient
  // shouldn't be able to keep using the app.
  const patient = await prisma.patient.findFirst({
    where: { id: payload.sub, tenantId: payload.tid, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!patient) throw new ContextError("Patient account not found", 401);
  if (patient.status !== "ACTIVE") {
    throw new ContextError(`Patient account is ${patient.status}`, 403);
  }

  const branchId = h.get("x-branch-id") ?? undefined;

  return {
    correlationId,
    tenantId: payload.tid,
    patientId: payload.sub,
    branchId,
    lineUserId: payload.lid,
  };
}
