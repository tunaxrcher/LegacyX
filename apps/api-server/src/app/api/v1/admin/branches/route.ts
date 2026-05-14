import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  CreateBranchDto,
  createBranch,
  listBranches,
} from "../../../../../modules/admin/admin-branches.service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await listBranches(ctx);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = CreateBranchDto.parse(body);
    const result = await createBranch(ctx, dto);
    return NextResponse.json(
      { data: result, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
