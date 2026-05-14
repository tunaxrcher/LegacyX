import type { PatientSession } from "./session";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function patientFetch(
  session: PatientSession | null,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (session?.token) headers["authorization"] = `Bearer ${session.token}`;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
}

export async function patientJson<T>(
  session: PatientSession | null,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await patientFetch(session, path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
