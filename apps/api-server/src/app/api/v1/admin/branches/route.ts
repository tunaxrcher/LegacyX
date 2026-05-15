import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import { parsePagination } from "../../../../../shared/pagination";
import {
  CreateBranchDto,
  createBranch,
  listBranches,
} from "../../../../../modules/admin/admin-branches.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const { page, perPage } = parsePagination(url, {
      defaultPerPage: 25,
      maxPerPage: 200,
    });
    const result = await listBranches(ctx, {
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page,
      perPage,
    });
    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
      correlation_id: correlationId,
    });
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
