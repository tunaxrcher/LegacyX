/**
 * Avatar upload endpoint.
 *
 * Same plumbing as service-image but guarded by `user:write:tenant` (only
 * ADMIN can write users) and stores files under `avatars/{tenantId}/...`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ulid } from "ulid";
import { getRequestContext } from "../../../../../shared/context";
import {
  toErrorResponse,
  BadRequest,
  HttpError,
} from "../../../../../shared/errors";
import { authorize } from "../../../../../shared/auth";
import { putObject, S3UploadError } from "../../../../../shared/s3";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

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
    await authorize(ctx, { resource: "user", action: "write" });

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
    const key = `avatars/${ctx.tenantId}/${ulid()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    let url: string;
    try {
      url = await putObject(key, buf, { ContentType: type });
    } catch (s3Err) {
      if (s3Err instanceof S3UploadError) {
        throw new HttpError(502, "STORAGE_ERROR", s3Err.message, s3Err.detail);
      }
      throw s3Err;
    }

    return NextResponse.json({
      data: { url, key, size, mime: type },
      correlation_id: correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
