/**
 * Patient photo service — Phase S.
 *
 * Covers:
 *   - KYC ID upload (patient or staff at the desk).
 *   - Before / After / Procedure photos uploaded from a Visit detail page.
 *   - Optional Gemini Vision draft analysis is fetched lazily by a separate
 *     endpoint so the upload itself never blocks on the AI service.
 *
 * ABAC:
 *   - `patient:write` to upload (DOCTOR/NURSE/RECEPTION/MANAGER).
 *   - `patient:read`  to list / download.
 *   - `patient:write` to delete (soft-delete; PDPA scrub goes through the
 *     pdpa.anonymize flow which also wipes these rows).
 */

import { z } from "zod";
import { prisma } from "@legacyx/db";
import { ulid } from "ulid";
import type { RequestContext } from "../../shared/context";
import { authorize } from "../../shared/auth";
import { BadRequest, NotFound, HttpError } from "../../shared/errors";
import { Prisma } from "@legacyx/db";
import { putObject, S3UploadError, buildPublicUrl } from "../../shared/s3";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"] as const);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — clinical photos can be large.
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const PhotoKindSchema = z.enum([
  "KYC_ID",
  "KYC_SELFIE",
  "BEFORE",
  "AFTER",
  "PROCEDURE",
  "OTHER",
]);
export type PhotoKind = z.infer<typeof PhotoKindSchema>;

export const UploadPhotoMetaDto = z.object({
  patient_id: z.string().min(1),
  kind: PhotoKindSchema,
  visit_id: z.string().optional(),
  region: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
});

export type UploadPhotoInput = z.infer<typeof UploadPhotoMetaDto> & {
  buffer: Buffer;
  mimeType: string;
  size: number;
};

export async function uploadPatientPhoto(ctx: RequestContext, input: UploadPhotoInput) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  if (!ctx.actor.id) throw BadRequest("Authenticated user required");

  if (!ALLOWED_MIME.has(input.mimeType as typeof ALLOWED_MIME extends Set<infer T> ? T : never)) {
    throw BadRequest(
      `Unsupported file type "${input.mimeType}". Allowed: JPEG, PNG, WebP`,
    );
  }
  if (input.size > MAX_BYTES) {
    throw BadRequest(
      `File too large (${(input.size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
    );
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patient_id, tenantId: ctx.tenantId },
  });
  if (!patient) throw NotFound(`Patient ${input.patient_id} not found`);

  const ext = EXT[input.mimeType] ?? "bin";
  const folder = input.kind.startsWith("KYC") ? "kyc" : "patient-photos";
  const key = `${folder}/${ctx.tenantId}/${input.patient_id}/${ulid()}.${ext}`;

  try {
    await putObject(key, input.buffer, {
      ContentType: input.mimeType,
      // KYC photos are NEVER public-read — they contain the national ID. We
      // always require a signed URL or inline staff download via the API.
      // Before/After clinical shots are also private (medical record).
      ACL: "private",
    });
  } catch (err) {
    if (err instanceof S3UploadError) {
      throw new HttpError(502, "STORAGE_ERROR", err.message, err.detail);
    }
    throw err;
  }

  const photo = await prisma.patientPhoto.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId ?? null,
      patientId: input.patient_id,
      visitId: input.visit_id ?? null,
      kind: input.kind,
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: input.size,
      region: input.region ?? null,
      note: input.note ?? null,
      uploadedBy: ctx.actor.id,
    },
  });

  // KYC upload also moves verification status forward so reception can review.
  if (input.kind === "KYC_ID" && patient.verificationStatus === "UNVERIFIED") {
    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        kycImageUrl: key,
        verificationStatus: "PENDING",
      },
    });
  }

  return {
    id: photo.id,
    kind: photo.kind,
    storageKey: photo.storageKey,
    sizeBytes: photo.sizeBytes,
    region: photo.region,
    createdAt: photo.createdAt,
  };
}

export async function listPatientPhotos(
  ctx: RequestContext,
  patientId: string,
  filter?: { kind?: PhotoKind; visit_id?: string },
) {
  await authorize(ctx, {
    resource: "patient",
    action: "read",
    target: { branchId: ctx.branchId },
  });
  const photos = await prisma.patientPhoto.findMany({
    where: {
      tenantId: ctx.tenantId,
      patientId,
      deletedAt: null,
      kind: filter?.kind,
      visitId: filter?.visit_id,
    },
    orderBy: { createdAt: "desc" },
  });

  return photos.map((p) => ({
    id: p.id,
    kind: p.kind,
    storageKey: p.storageKey,
    mimeType: p.mimeType,
    sizeBytes: p.sizeBytes,
    region: p.region,
    note: p.note,
    visitId: p.visitId,
    analysis: p.analysis,
    // For dev / MinIO with public-read this still works; for prod (private
    // ACL) the UI should call the dedicated /:id/url endpoint that returns a
    // short-lived signed URL.
    publicUrl: buildPublicUrl(p.storageKey),
    createdAt: p.createdAt,
  }));
}

export async function deletePatientPhoto(ctx: RequestContext, id: string) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  const photo = await prisma.patientPhoto.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!photo) throw NotFound(`Photo ${id} not found`);
  await prisma.patientPhoto.update({
    where: { id: photo.id },
    data: { deletedAt: new Date() },
  });
  return { id, deleted: true };
}

/**
 * Run Gemini Vision analysis on a stored photo and persist the result.
 * The actual model call lives in apps/ai-service. We POST the base64 to it
 * and wait for the structured response.
 */
export async function analyzePatientPhoto(ctx: RequestContext, id: string) {
  await authorize(ctx, {
    resource: "patient",
    action: "write",
    target: { branchId: ctx.branchId },
  });
  const photo = await prisma.patientPhoto.findFirst({
    where: { id, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!photo) throw NotFound(`Photo ${id} not found`);

  // Pull the bytes from S3 and re-encode as base64. We have to import lazily
  // here to keep cold-start lean for routes that never run vision.
  const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const cfg = {
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  };
  const s3 = new S3Client(cfg);
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: photo.storageKey }),
  );
  // The body is a stream; collect into Buffer.
  const chunks: Uint8Array[] = [];
  // @ts-expect-error - SDK types are awkward; transformToByteArray exists
  if (typeof obj.Body.transformToByteArray === "function") {
    // @ts-expect-error - same
    const arr: Uint8Array = await obj.Body.transformToByteArray();
    chunks.push(arr);
  } else {
    for await (const c of obj.Body as AsyncIterable<Uint8Array>) chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  const base64 = buf.toString("base64");

  const aiUrl = process.env.AI_SERVICE_URL ?? "http://localhost:3002";
  const res = await fetch(`${aiUrl}/ai/vision/analyze`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": ctx.tenantId,
      "x-branch-id": ctx.branchId ?? "",
    },
    body: JSON.stringify({
      ref_id: photo.id,
      image_base64: base64,
      mime_type: photo.mimeType,
      kind: photo.kind === "BEFORE" || photo.kind === "AFTER" ? photo.kind : "OTHER",
      context: photo.note ?? photo.region ?? "",
    }),
  });
  if (!res.ok) {
    throw new HttpError(
      502,
      "AI_SERVICE_ERROR",
      `Gemini vision failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as { data?: { draft?: unknown } };
  const analysis = json.data?.draft ?? null;

  const updated = await prisma.patientPhoto.update({
    where: { id: photo.id },
    data: {
      analysis: analysis === null ? Prisma.DbNull : (analysis as Prisma.InputJsonValue),
    },
  });
  return { id: updated.id, analysis: updated.analysis };
}
