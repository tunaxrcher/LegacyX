/**
 * Service-image upload endpoint.
 *
 * Accepts a single image file via `multipart/form-data` (field name: `file`),
 * stores it in S3/DO Spaces under `service-images/{tenantId}/{ulid}.{ext}`,
 * and returns the public URL. Image size is capped at 5 MB and the MIME type
 * is validated server-side. The endpoint is guarded by `catalog:manage:tenant`,
 * so only MANAGER/ADMIN can upload (same permission that controls the rest
 * of the service catalog admin surface).
 */
import { NextResponse, type NextRequest } from "next/server";
import { ulid } from "ulid";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse, BadRequest } from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";
import { putObject } from "../../../../../shared/s3";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, { resource: "catalog", action: "manage" });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw BadRequest("file field is required (multipart/form-data)");
    }

    const type = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(type)) {
      throw BadRequest(
        `Unsupported file type "${type}". Allowed: JPEG, PNG, WebP, GIF`,
      );
    }

    const size = file.size;
    if (size > MAX_BYTES) {
      throw BadRequest(
        `File too large (${(size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    const ext = EXT[type] ?? "bin";
    const key = `service-images/${ctx.tenantId}/${ulid()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await putObject(key, buf, { ContentType: type });

    return NextResponse.json({
      data: { url, key, size, mime: type },
      correlation_id: correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
