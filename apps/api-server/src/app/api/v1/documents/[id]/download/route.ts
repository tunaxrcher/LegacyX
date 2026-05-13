import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse, NotFound, BadRequest } from "../../../../../../shared/errors";
import { authorize } from "../../../../../../shared/auth";

export const dynamic = "force-dynamic";

function storageRoot() {
  return process.env.STORAGE_DIR ?? path.resolve(process.cwd(), "../../storage/docs");
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "patient",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    const doc = await prisma.document.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!doc) throw NotFound(`Document ${params.id} not found`);
    if (doc.status !== "GENERATED") {
      throw BadRequest(`Document is ${doc.status}, not ready for download`);
    }
    const filePath = path.join(storageRoot(), doc.storageKey);
    await stat(filePath); // throws if missing
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.type}-${doc.id}.pdf"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
