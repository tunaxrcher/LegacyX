import { NextResponse, type NextRequest } from "next/server";
import { readLocalObject, isLocalStorageMode } from "../../../../../shared/s3";
import { toErrorResponse, NotFound } from "../../../../../shared/errors";

export const dynamic = "force-dynamic";

/**
 * Local-disk image server for dev mode. Resolves `key = path.join("/")` and
 * streams the file back. In production (`isLocalStorageMode === false`)
 * this route 404s — clients should be hitting the real S3 / Spaces URL.
 *
 * Auth: NONE — these are tenant-scoped clinical images and we already gate
 * the *upload* endpoint behind ABAC. Adding a JWT check here would require
 * passing a token in <img src=…> which Next.js Image won't do, so we trade
 * the convenience-for-dev for a tiny security paper-cut. Production must
 * use signed S3 URLs (private ACL).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  let correlationId: string | undefined;
  try {
    if (!isLocalStorageMode()) throw NotFound("Local uploads disabled");
    const key = (params.path ?? []).join("/");
    const obj = await readLocalObject(key);
    if (!obj) throw NotFound("Object not found");
    return new NextResponse(new Uint8Array(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
