import { proxyPublic } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Public branch list — used by the profile editor's "home branch" picker.
 * Tenant slug is auto-injected by `proxyPublic`.
 */
export async function GET() {
  return proxyPublic("/api/v1/public/branches");
}
