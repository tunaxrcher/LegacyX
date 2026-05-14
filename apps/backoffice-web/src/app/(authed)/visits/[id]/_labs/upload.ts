// Upload helpers for lab attachments.
//
// We keep these isolated because the upload endpoint streams `multipart/form-data`
// directly (so we can't go through `clientApi.post()` which JSON-encodes), and
// because we want to surface server-side error envelopes (`error.code`) to
// callers in a structured way.

const ALLOWED_LAB_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const MAX_LAB_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB — matches the API guard

export function isAllowedLabAttachment(file: File): boolean {
  return (ALLOWED_LAB_ATTACHMENT_TYPES as readonly string[]).includes(file.type);
}

/**
 * Upload one lab attachment (PDF / image) and return its storage key. The key
 * is what we pass to the lab-result API as `file_key`. Throws on any non-2xx
 * response with the server-supplied error code/message when available.
 */
export async function uploadLabAttachment(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/v1/uploads/lab-attachment", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body?.error?.message) {
        message = body.error.code
          ? `[${body.error.code}] ${body.error.message}`
          : body.error.message;
      }
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const json = (await res.json()) as { data: { key: string } };
  return json.data.key;
}
