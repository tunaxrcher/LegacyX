import { NextResponse } from "next/server";
import { registry } from "../../../shared/metrics";

export const dynamic = "force-dynamic";

/**
 * Prometheus scrape endpoint.
 *
 * Auth model:
 *   - If `METRICS_BEARER_TOKEN` is set, requests must pass it as
 *     `Authorization: Bearer <token>`.
 *   - In **production**, the token is REQUIRED. We refuse to serve metrics
 *     unauthenticated in prod (info-leak / DoS surface for scrapers).
 *   - In dev/test, the endpoint is open by default for local Prometheus.
 */
export async function GET(req: Request) {
  const expected = process.env.METRICS_BEARER_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("metrics disabled (set METRICS_BEARER_TOKEN)", {
        status: 503,
      });
    }
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (token !== expected) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }
  const body = registry.render();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
