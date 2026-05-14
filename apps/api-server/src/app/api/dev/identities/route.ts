import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";

/**
 * DEV-ONLY: returns the list of tenants/branches/users for the login picker
 * in backoffice-web. Phase 6 will replace with real session/JWT auth.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_IDENTITIES) {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
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
