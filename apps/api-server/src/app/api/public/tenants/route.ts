import { NextResponse } from "next/server";
import { prisma } from "@legacyx/db";

export const dynamic = "force-dynamic";

/**
 * Public list of tenants — no auth required, used by the login page so the
 * user can pick their organization from a dropdown instead of typing the slug.
 *
 * Returns only the public-safe fields (id/slug/name).
 */
export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true },
    });
    return NextResponse.json({ data: tenants });
  } catch (err) {
    return NextResponse.json(
      { error: { message: (err as Error).message ?? "unknown" } },
      { status: 500 }
    );
  }
}
