import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const TENANT_SLUG = process.env.PATIENT_APP_TENANT_SLUG ?? "legacyx";

/**
 * Public branch list — used by the profile editor's "home branch" picker.
 * Authentication isn't required (the upstream endpoint is `/public/branches`)
 * but we keep the proxy here so the browser only ever talks to its own
 * origin (no CORS, no env leakage).
 */
export async function GET() {
  const res = await fetch(
    `${API_BASE}/api/v1/public/branches?tenant_slug=${encodeURIComponent(
      TENANT_SLUG,
    )}`,
    { cache: "no-store" },
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
