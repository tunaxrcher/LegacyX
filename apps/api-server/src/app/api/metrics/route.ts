import { NextResponse } from "next/server";
import { registry } from "../../../shared/metrics";

export const dynamic = "force-dynamic";

/**
 * Prometheus scrape endpoint.
 *
 * Lock down with `METRICS_BEARER_TOKEN` in production. Without it set, the
 * endpoint is publicly accessible (fine for internal-only deployments behind
 * a reverse proxy).
 */
export async function GET(req: Request) {
  const expected = process.env.METRICS_BEARER_TOKEN;
  if (expected) {
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
