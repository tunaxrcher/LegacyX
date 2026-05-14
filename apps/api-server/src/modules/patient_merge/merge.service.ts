import { z } from "zod";
import { ConsentEvents, EVENT_NAMES } from "@legacyx/events";
import { prisma } from "@legacyx/db";
import { BadRequest, Conflict, NotFound } from "../../shared/errors";
import { writeWithOutbox } from "../../shared/outbox";
import { authorize } from "../../shared/auth";
import type { RequestContext } from "../../shared/context";

/**
 * Phase K — Patient Merge Engine.
 *
 * Real-world reason this exists: receptionists occasionally create a brand
 * new patient because they didn't realise the patient already had a record
 * (different name spelling, no national-id supplied, etc.). Once the
 * mistake is caught, ALL of the orphaned record's children — visits,
 * invoices, EMR, wallet ledger, consents — must move under the surviving
 * record so future encounters see one continuous timeline.
 *
 * Rules (enforced here, not the UI):
 *   1. From-patient must not already be MERGED (no chains; merge into head).
 *   2. From and into must be different patients.
 *   3. Both must belong to the same tenant.
 *   4. Reason ≥ 8 chars (PDPA Article 30 — controllers must justify).
 *   5. The transfer happens in a single $transaction; if any step fails the
 *      whole merge is rolled back. We DO NOT do partial merges.
 *   6. The from-patient's status flips to MERGED and `mergedIntoId` is set.
 *      We never delete the row — its `id` is referenced by historical
 *      audit-log records, so it stays as a "tombstone" for forensics.
 *   7. lineUserId / phoneHash on the from-patient is cleared so future
 *      lookups land on the surviving patient (no duplicate match).
 *   8. Wallet ledger entries are immutable — they keep their original ids
 *      but the FK swings over. Same for invoices, payments etc.
 */

export const FindDuplicatesQuery = z.object({
  /**
   * Free-text fragment matched against `firstName`, `lastName`, `hn`. Empty
   * string returns the top dups (best for a manager browsing).
   */
  q: z.string().max(120).optional(),
  /** Cap response so the table stays snappy. */
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type DupGroup = {
  signal: "phone" | "name+dob" | "name";
  patients: Array<{
    id: string;
    hn: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: string;
    appointmentCount: number;
    visitCount: number;
    invoiceCount: number;
    walletCount: number;
  }>;
};

export async function findDuplicates(
  ctx: RequestContext,
  input: z.infer<typeof FindDuplicatesQuery>,
): Promise<DupGroup[]> {
  // Tenant-scoped check (manager runs this across branches).
  await authorize(ctx, { resource: "patient", action: "merge" });

  // Two cheap signals on top of the existing indexes:
  //   1. duplicate phoneHash → strong signal (same phone, two records)
  //   2. firstName + lastName + dob → weaker signal but catches the no-phone
  //      case.
  // We don't try fancy fuzzy-string matching at the DB layer because it
  // doesn't index well in MySQL. The manager UI lets the human resolve
  // ambiguous cases.
  const where = { tenantId: ctx.tenantId, deletedAt: null, status: "ACTIVE" as const };
  const all = await prisma.patient.findMany({
    where: input.q
      ? {
          ...where,
          OR: [
            { firstName: { contains: input.q } },
            { lastName: { contains: input.q } },
            { hn: { contains: input.q } },
          ],
        }
      : where,
    select: {
      id: true,
      hn: true,
      firstName: true,
      lastName: true,
      status: true,
      createdAt: true,
      phoneHash: true,
      dob: true,
    },
    take: 500, // hard cap — we'll group these client-side
  });

  // Group by phoneHash (when present) and by name+dob.
  const byPhone = new Map<string, typeof all>();
  const byName = new Map<string, typeof all>();
  for (const p of all) {
    if (p.phoneHash) {
      const arr = byPhone.get(p.phoneHash) ?? [];
      arr.push(p);
      byPhone.set(p.phoneHash, arr);
    }
    const nameKey = [
      p.firstName.trim().toLowerCase(),
      p.lastName.trim().toLowerCase(),
      p.dob ? p.dob.toISOString().slice(0, 10) : "",
    ].join("|");
    const arr2 = byName.get(nameKey) ?? [];
    arr2.push(p);
    byName.set(nameKey, arr2);
  }

  // Collect counts only for the groups we'll actually return — avoids a
  // count() per patient.
  const groups: DupGroup[] = [];
  const seenPatientIds = new Set<string>();
  const enrich = async (
    rows: typeof all,
    signal: DupGroup["signal"],
  ): Promise<DupGroup | null> => {
    if (rows.length < 2) return null;
    const ids = rows.map((r) => r.id);
    const [aCount, vCount, iCount, wCount] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["patientId"],
        where: { patientId: { in: ids } },
        _count: true,
      }),
      prisma.visit.groupBy({
        by: ["patientId"],
        where: { patientId: { in: ids } },
        _count: true,
      }),
      prisma.invoice.groupBy({
        by: ["patientId"],
        where: { patientId: { in: ids } },
        _count: true,
      }),
      prisma.walletAccount.groupBy({
        by: ["patientId"],
        where: { patientId: { in: ids } },
        _count: true,
      }),
    ]);
    const cMap = (rows: { patientId: string; _count: number }[]) =>
      new Map(rows.map((r) => [r.patientId, r._count]));
    const aM = cMap(aCount as never);
    const vM = cMap(vCount as never);
    const iM = cMap(iCount as never);
    const wM = cMap(wCount as never);
    return {
      signal,
      patients: rows.map((r) => ({
        id: r.id,
        hn: r.hn,
        firstName: r.firstName,
        lastName: r.lastName,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        appointmentCount: aM.get(r.id) ?? 0,
        visitCount: vM.get(r.id) ?? 0,
        invoiceCount: iM.get(r.id) ?? 0,
        walletCount: wM.get(r.id) ?? 0,
      })),
    };
  };

  for (const rows of byPhone.values()) {
    if (groups.length >= input.limit) break;
    const g = await enrich(rows, "phone");
    if (g) {
      groups.push(g);
      for (const p of g.patients) seenPatientIds.add(p.id);
    }
  }
  for (const rows of byName.values()) {
    if (groups.length >= input.limit) break;
    // Skip if every patient in this name-group is already covered by a
    // phone-group above (avoids duplicating the table row).
    if (rows.every((r) => seenPatientIds.has(r.id))) continue;
    const g = await enrich(rows, "name+dob");
    if (g) groups.push(g);
  }
  return groups;
}

export const MergePatientsDto = z.object({
  from_patient_id: z.string().min(1),
  into_patient_id: z.string().min(1),
  reason: z
    .string()
    .min(8, "Reason must be at least 8 characters (PDPA traceability)")
    .max(500),
});

export async function mergePatients(
  ctx: RequestContext,
  input: z.infer<typeof MergePatientsDto>,
) {
  await authorize(ctx, { resource: "patient", action: "merge" });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  if (input.from_patient_id === input.into_patient_id) {
    throw BadRequest("from_patient_id and into_patient_id must differ");
  }

  const [from, into] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: input.from_patient_id, tenantId: ctx.tenantId, deletedAt: null },
    }),
    prisma.patient.findFirst({
      where: { id: input.into_patient_id, tenantId: ctx.tenantId, deletedAt: null },
    }),
  ]);
  if (!from) throw NotFound(`Source patient ${input.from_patient_id} not found`);
  if (!into) throw NotFound(`Target patient ${input.into_patient_id} not found`);
  if (from.status === "MERGED") {
    throw Conflict("Source patient is already merged — pick the surviving id");
  }
  if (into.status === "MERGED") {
    throw Conflict("Target patient is itself merged — pick its surviving record");
  }

  const performedBy = ctx.actor.id;
  return writeWithOutbox(ctx, async (tx) => {
    // Counts BEFORE the swap — used in audit log.
    const [
      apptCount,
      visitCount,
      invCount,
      walletCount,
      emrCount,
      consentCount,
    ] = await Promise.all([
      tx.appointment.count({ where: { patientId: from.id } }),
      tx.visit.count({ where: { patientId: from.id } }),
      tx.invoice.count({ where: { patientId: from.id } }),
      tx.walletAccount.count({ where: { patientId: from.id } }),
      tx.eMR.count({ where: { patientId: from.id } }),
      tx.consentSnapshot.count({ where: { patientId: from.id } }),
    ]);

    // Move every child row over. updateMany is fine here — the patientId
    // column has indexes on every relevant table.
    await tx.appointment.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.visit.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.invoice.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.walletAccount.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.walletLedger.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.eMR.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.labOrder.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.order.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.procedure.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.pharmacyDispense.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    // Phase S — patient photos (KYC + before/after) belong with the surviving
    // patient. We do NOT delete or anonymise here; the merge log preserves
    // the original patient_id reference if a regulator audits the move.
    await tx.patientPhoto.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });
    await tx.consentSnapshot.updateMany({
      where: { patientId: from.id },
      data: { patientId: into.id },
    });

    // Tombstone the source. We blank out lineUserId / phoneHash so future
    // lookups (guest auto-onboard, LIFF login) match the surviving patient.
    const updatedFrom = await tx.patient.update({
      where: { id: from.id },
      data: {
        status: "MERGED",
        mergedIntoId: into.id,
        lineUserId: null,
        phoneHash: null,
      },
    });

    // Forensic record. Keeps the from→into link + counts forever.
    const log = await tx.patientMergeLog.create({
      data: {
        tenantId: ctx.tenantId,
        fromPatientId: from.id,
        intoPatientId: into.id,
        performedBy,
        reason: input.reason,
        diff: {
          moved: {
            appointments: apptCount,
            visits: visitCount,
            invoices: invCount,
            wallets: walletCount,
            emrs: emrCount,
            consents: consentCount,
          },
          fromBefore: {
            firstName: from.firstName,
            lastName: from.lastName,
            hn: from.hn,
          },
          intoBefore: {
            firstName: into.firstName,
            lastName: into.lastName,
            hn: into.hn,
          },
        },
      },
    });

    // Audit row stays in the same tx so a partial merge cannot exist without
    // a paper trail.
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorUserId: performedBy,
        action: "patient.merge",
        resourceType: "Patient",
        resourceId: from.id,
        correlationId: ctx.correlationId,
        before: {
          status: from.status,
          firstName: from.firstName,
          lastName: from.lastName,
        } as object,
        after: {
          status: "MERGED",
          mergedIntoId: into.id,
          mergeLogId: log.id,
          movedCounts: {
            appointments: apptCount,
            visits: visitCount,
            invoices: invCount,
            wallets: walletCount,
            emrs: emrCount,
            consents: consentCount,
          },
          reason: input.reason,
        } as object,
      },
    });

    return {
      result: { mergeLogId: log.id, fromPatient: updatedFrom, intoPatientId: into.id },
      events: [
        {
          eventName: EVENT_NAMES.PATIENT_MERGED,
          payload: ConsentEvents.PatientMergedV1Payload.parse({
            from_patient_id: from.id,
            into_patient_id: into.id,
            performed_by: performedBy,
            reason: input.reason,
            moved_counts: {
              appointments: apptCount,
              visits: visitCount,
              invoices: invCount,
              wallets: walletCount,
              emrs: emrCount,
              consents: consentCount,
            },
          }),
        },
      ],
    };
  });
}

export async function listMergeLogs(ctx: RequestContext, limit = 50) {
  await authorize(ctx, { resource: "audit", action: "read" });
  return prisma.patientMergeLog.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
