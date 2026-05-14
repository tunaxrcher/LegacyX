import { sessionHeaders, type Session } from "./session";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/** Server-side fetch from api-server with session headers + no caching. */
async function apiFetch(
  session: Session,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...sessionHeaders(session),
      ...(init?.headers ?? {}),
    },
  });
}

export async function apiJson<T>(
  session: Session,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(session, path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
