import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware:
 *   - Ensures every request has an `x-correlation-id` header.
 *   - Enforces a CORS allowlist (env `ALLOWED_ORIGINS`, comma-separated).
 *     In development falls back to localhost:3003 + 127.0.0.1:*.
 *   - Auth itself is enforced inside route handlers (Bearer token →
 *     `resolveSession()` → DB lookup). See `shared/context.ts`.
 *
 * Note: metrics & tracing are recorded inside route handlers, not here. Edge
 * middleware can't see response bodies or final status codes for streaming
 * responses, and it runs in the Edge runtime where `prom-client` style libs
 * aren't available.
 */

// Read once at module load. In dev, ALLOWED_ORIGINS may be undefined, in which
// case we accept the conventional backoffice ports.
const RAW_ALLOWED = process.env.ALLOWED_ORIGINS ?? "";
const STATIC_ALLOWED = new Set(
  RAW_ALLOWED.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const IS_DEV = process.env.NODE_ENV !== "production";

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED.has(origin)) return true;
  if (!IS_DEV) return false;
  // Dev-only: allow localhost / 127.0.0.1 on any port
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function middleware(req: NextRequest) {
  const reqHeaders = new Headers(req.headers);

  if (!reqHeaders.get("x-correlation-id")) {
    reqHeaders.set("x-correlation-id", crypto.randomUUID());
  }

  const origin = req.headers.get("origin");
  const allowed = isOriginAllowed(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: allowed ? 204 : 403,
      headers: allowed ? corsHeaders(origin!) : {},
    });
  }

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("x-correlation-id", reqHeaders.get("x-correlation-id")!);
  if (allowed && origin) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      res.headers.set(k, v);
    }
  }
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "content-type,authorization,x-tenant-id,x-branch-id,x-user-id,x-correlation-id,x-session-token",
    "access-control-expose-headers": "x-correlation-id",
  };
}

export const config = {
  matcher: ["/api/:path*"],
};
