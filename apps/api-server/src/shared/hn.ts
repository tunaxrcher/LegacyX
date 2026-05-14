import { prisma } from "@legacyx/db";

/**
 * Allocate the next Hospital Number (HN) for a tenant.
 *
 * Format: `HN-0000001` (7-digit zero-padded), sequential per tenant.
 *
 * NOTE: this implementation reads-then-writes which is racy under concurrent
 * load. Production should swap to a dedicated counter row + advisory lock
 * (or a DB sequence). For seed-scale clinics it is fine.
 */
export async function nextHN(tenantId: string): Promise<string> {
  const last = await prisma.patient.findFirst({
    where: { tenantId, hn: { startsWith: "HN-" } },
    orderBy: { hn: "desc" },
    select: { hn: true },
  });
  const lastNum = last?.hn?.replace(/^HN-/, "");
  const n = lastNum ? parseInt(lastNum, 10) + 1 : 1;
  return `HN-${n.toString().padStart(7, "0")}`;
}
