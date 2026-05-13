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

export async function clientPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export async function clientGet<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>("GET", path, undefined, init);
}

export const clientApi = {
  get: clientGet,
  post: clientPost,
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
