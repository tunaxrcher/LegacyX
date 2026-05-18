/**
 * S3 / DigitalOcean Spaces helper.
 *
 * DO Spaces accepts the standard AWS S3 API. The convention we use here:
 *   - `S3_ENDPOINT`  must be the **region** endpoint, e.g.
 *                   `https://sgp1.digitaloceanspaces.com`.
 *                   If the user pasted the **bucket** URL by accident
 *                   (`https://{bucket}.sgp1.digitaloceanspaces.com`) we strip
 *                   the bucket prefix automatically so the SDK doesn't end up
 *                   building `bucket.bucket.sgp1...` style hosts.
 *   - `S3_BUCKET`   is the bucket / Space name (e.g. `legacyx-dev`).
 *   - `S3_REGION`   any string; DO doesn't validate it. We send the value the
 *                   user supplied so signatures look "real".
 *   - `forcePathStyle` honoured from env but DEFAULTS to FALSE — DO Spaces is
 *                   the AWS virtual-host style by default. The
 *                   `S3_FORCE_PATH_STYLE=true` value in `.env.dev.example` was
 *                   misleading; ignore it unless you really need path-style.
 *
 * Public URLs are built virtual-host style:
 *   `https://{bucket}.{region-host}/{key}`
 * which is what DO publishes for objects with `ACL: public-read`.
 */
import { promises as fs } from "fs";
import * as path from "path";
import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

/** True when the four S3_* env vars are all present. Cheap, no SDK call. */
function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY,
  );
}

/**
 * In dev / quick-start setups where the operator hasn't pointed at MinIO or
 * DigitalOcean Spaces yet we transparently switch to a local-disk fallback
 * so the upload UX still works. In production (`NODE_ENV=production`) this
 * mode is rejected — devs MUST configure real object storage.
 */
function localStorageDir(): string {
  return (
    process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), ".local-uploads")
  );
}

export function isLocalStorageMode(): boolean {
  if (isS3Configured()) return false;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

type S3Cfg = {
  endpoint: string;
  regionHost: string; // hostname only, no scheme — used for publicHost building
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

function readEnv(): S3Cfg {
  const endpointRaw = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "us-east-1";
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  // Default to FALSE — DO Spaces standard is virtual-host. Honour env if set
  // explicitly to "true" (some self-hosted MinIO setups still want path-style).
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 not configured — set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY in .env",
    );
  }

  const u = new URL(endpointRaw);
  if (u.hostname.startsWith(`${bucket}.`)) {
    u.hostname = u.hostname.slice(bucket.length + 1);
  }
  const regionHost = u.hostname;
  const endpoint = `${u.protocol}//${regionHost}`;

  return {
    endpoint,
    regionHost,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };
}

function getClient(): S3Client {
  if (_client) return _client;
  const cfg = readEnv();
  _client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _client;
}

function getBucket(): string {
  return readEnv().bucket;
}

export function buildPublicUrl(key: string): string {
  if (isLocalStorageMode()) {
    return `/api/v1/uploads/${key.replace(/^\/+/, "")}`;
  }
  const cfg = readEnv();
  if (cfg.forcePathStyle) {
    return `${cfg.endpoint}/${cfg.bucket}/${key.replace(/^\/+/, "")}`;
  }
  return `https://${cfg.bucket}.${cfg.regionHost}/${key.replace(/^\/+/, "")}`;
}

/**
 * Read a previously uploaded object back from disk. Only used when running
 * in `isLocalStorageMode()`. Returns Buffer + content-type guess.
 */
export async function readLocalObject(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isLocalStorageMode()) return null;
  const safe = key.replace(/\.\.+/g, "").replace(/^\/+/, "");
  const fullPath = path.join(localStorageDir(), safe);
  try {
    const body = await fs.readFile(fullPath);
    const ext = path.extname(safe).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "application/octet-stream";
    return { body, contentType };
  } catch {
    return null;
  }
}

export type PutObjectOptions = Omit<
  PutObjectCommandInput,
  "Bucket" | "Key" | "Body"
>;

export class S3UploadError extends Error {
  constructor(
    message: string,
    public readonly detail?: {
      name?: string;
      code?: string;
      status?: number;
    },
  ) {
    super(message);
    this.name = "S3UploadError";
  }
}

/**
 * Upload a buffer to S3. The default ACL is `public-read` so the patient app
 * can reference the image directly. Errors from the SDK are wrapped in
 * `S3UploadError` with enough metadata for the route handler to forward a
 * useful message to the client (instead of an opaque "internal server error").
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  options: PutObjectOptions = {},
): Promise<string> {
  // Local-disk fallback for dev. Writes to `${LOCAL_STORAGE_DIR}/${key}`
  // (default `.local-uploads/`) and returns the relative URL to be served
  // by `/api/v1/uploads/[...]`.
  if (isLocalStorageMode()) {
    try {
      const safeKey = key.replace(/^\/+/, "").replace(/\.\.+/g, "");
      const fullPath = path.join(localStorageDir(), safeKey);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from(body));
      return buildPublicUrl(safeKey);
    } catch (err) {
      const e = err as { message?: string };
      throw new S3UploadError(
        `Local upload failed: ${e.message ?? "unknown"}`,
        { name: "LocalFsError" },
      );
    }
  }
  try {
    const client = getClient();
    const bucket = getBucket();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ACL: options.ACL ?? "public-read",
        ContentType: options.ContentType,
        CacheControl:
          options.CacheControl ?? "public, max-age=31536000, immutable",
        ...options,
      }),
    );
    return buildPublicUrl(key);
  } catch (err) {
    const e = err as {
      name?: string;
      Code?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const status = e.$metadata?.httpStatusCode;
    const name = e.name ?? "UnknownError";
    const code = e.Code;
    const message = e.message ?? "Upload failed with no message";
    console.error("[s3] putObject failed", {
      key,
      name,
      code,
      status,
      message,
      cfg: { ...readEnv(), secretAccessKey: "***" },
    });
    throw new S3UploadError(`S3 ${name}: ${message}`, {
      name,
      code,
      status,
    });
  }
}
