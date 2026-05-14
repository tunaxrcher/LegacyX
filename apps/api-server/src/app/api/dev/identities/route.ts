import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";

/**
 * DEV-ONLY: returns the list of tenants/branches/users for the login picker
 * in backoffice-web and for smoke-test scripts.
 *
 * Production lockdown — this endpoint dumps PII (phone numbers, full names,
 * tenant ids). It is **disabled** in production unless BOTH of the following
 * are true:
 *   1. `ALLOW_DEV_IDENTITIES=1`
 *   2. The request carries `x-internal-secret: <INTERNAL_API_SECRET>`
 * (Same shared secret as the header-only `getRequestContext()` fallback.)
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.ALLOW_DEV_IDENTITIES) {
      return NextResponse.json(
        { error: "disabled in production" },
        { status: 404 },
      );
    }
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const provided = headers().get("x-internal-secret") ?? "";
    if (
      !internalSecret ||
      internalSecret.length === 0 ||
      provided !== internalSecret
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const [tenants, branches, users] = await Promise.all([
    prisma.tenant.findMany({ select: { id: true, slug: true, name: true } }),
    prisma.branch.findMany({
      select: { id: true, code: true, name: true, tenantId: true },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        primaryRoleCode: true,
        fullName: true,
        tenantId: true,
      },
    }),
  ]);

  return NextResponse.json({ tenants, branches, users });
}
