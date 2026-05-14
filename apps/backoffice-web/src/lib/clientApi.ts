"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

function readSession() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )lx_session=([^;]+)/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1] ?? ""));
  } catch {
    return null;
  }
}

function headers(): Record<string, string> {
  const s = readSession();
  if (!s) return { "content-type": "application/json" };
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-tenant-id": s.tenantId,
    "x-branch-id": s.branchId,
    "x-user-id": s.userId,
  };
  if (s.token) h["authorization"] = `Bearer ${s.token}`;
  return h;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let text = `${method} ${path} → ${res.status}`;
    try {
      const j = await res.json();
      text =
        (j?.error?.message as string | undefined) ??
        (j?.message as string | undefined) ??
        text;
    } catch {
      try {
        text = `${text}: ${await res.text()}`;
      } catch {
        /* ignore */
      }
    }
    throw new Error(text);
  }
  // 204 no content
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

async function clientPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

async function clientGet<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>("GET", path, undefined, init);
}

/**
 * Upload a `FormData` body (file or multipart) and return the JSON payload's
 * `data` field. Used by the image uploader; do NOT call from JSON endpoints.
 */
async function clientUpload<T>(path: string, form: FormData): Promise<T> {
  const s = readSession();
  const h: Record<string, string> = {};
  if (s) {
    h["x-tenant-id"] = s.tenantId;
    h["x-branch-id"] = s.branchId;
    h["x-user-id"] = s.userId;
    if (s.token) h["authorization"] = `Bearer ${s.token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: h, // NO content-type — browser sets the multipart boundary
    body: form,
  });
  if (!res.ok) {
    let text = `POST ${path} → ${res.status}`;
    try {
      const j = await res.json();
      text =
        (j?.error?.message as string | undefined) ??
        (j?.message as string | undefined) ??
        text;
    } catch {
      try {
        text = `${text}: ${await res.text()}`;
      } catch {
        /* ignore */
      }
    }
    throw new Error(text);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export const clientApi = {
  get: clientGet,
  post: clientPost,
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: clientUpload,
};
