/**
 * S3 / DigitalOcean Spaces helper.
 *
 * The `.env` ships with a DO Spaces endpoint like
 *   `https://legacyx-dev.sgp1.digitaloceanspaces.com`
 * which is the **virtual-host** URL (bucket baked into the hostname). The
 * AWS SDK builds its own URLs, so we strip the bucket prefix to derive the
 * **region endpoint** (`https://sgp1.digitaloceanspaces.com`) and let the SDK
 * re-construct the canonical URL via the `bucket` config. The public URL
 * pattern after upload stays the same as the original (virtual-host) URL —
 * which is what users will reference from the patient app.
 */
import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

function readEnv() {
  const endpointRaw = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "us-east-1";
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";
  if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 not configured — set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY in .env",
    );
  }
  // Normalise: if endpoint host starts with "{bucket}." (virtual-host style),
  // strip the prefix to derive the plain region endpoint.
  const u = new URL(endpointRaw);
  if (u.hostname.startsWith(`${bucket}.`)) {
    u.hostname = u.hostname.slice(bucket.length + 1);
  }
  const regionEndpoint = `${u.protocol}//${u.hostname}`.replace(/\/$/, "");

  return {
    endpoint: regionEndpoint,
    publicHost: `https://${bucket}.${u.hostname}`,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };
}

function getClient() {
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

export function getBucket(): string {
  return readEnv().bucket;
}

export function buildPublicUrl(key: string): string {
  return `${readEnv().publicHost}/${key.replace(/^\/+/, "")}`;
}

export type PutObjectOptions = Omit<
  PutObjectCommandInput,
  "Bucket" | "Key" | "Body"
>;

/**
 * Upload a buffer to S3 and return the public URL. The default ACL is
 * `public-read` so the patient app can reference the image directly.
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  options: PutObjectOptions = {},
): Promise<string> {
  const client = getClient();
  const bucket = getBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ACL: options.ACL ?? "public-read",
      ContentType: options.ContentType,
      CacheControl: options.CacheControl ?? "public, max-age=31536000, immutable",
      ...options,
    }),
  );
  return buildPublicUrl(key);
}
