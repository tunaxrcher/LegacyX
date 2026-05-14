/**
 * Lab-attachment upload endpoint.
 *
 * Accepts a single file via `multipart/form-data` (field name: `file`) and
 * stores it in S3/DO Spaces under `lab-attachments/{tenantId}/{ulid}.{ext}`.
 * Used by the "Record Result" dialog on `/visits/<id>` for a NURSE to attach
 * the lab partner's PDF report or photographed result slip.
 *
 * Allowed MIME types:
 *   - application/pdf
 *   - image/jpeg, image/png, image/webp, image/heic
 *
 * Size cap: 10 MB. Guarded by `lab:result` (same permission gate as recording
 * the result itself).
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
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — lab PDFs can be heavier than service images

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "lab",
      action: "result",
      target: { branchId: ctx.branchId },
    });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw BadRequest("file field is required (multipart/form-data)");
    }

    const type = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(type)) {
      throw BadRequest(
        `Unsupported file type "${type}". Allowed: PDF, JPEG, PNG, WebP, HEIC`,
      );
    }

    const size = file.size;
    if (size > MAX_BYTES) {
      throw BadRequest(
        `File too large (${(size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    const ext = EXT[type] ?? "bin";
    const key = `lab-attachments/${ctx.tenantId}/${ulid()}.${ext}`;
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
