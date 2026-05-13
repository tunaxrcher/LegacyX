import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../shared/context";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  CreateUserDto,
  createUser,
  listUsers,
} from "../../../../../modules/admin/admin-users.service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await listUsers(ctx);
    return NextResponse.json({ data, correlation_id: ctx.correlationId });
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
    const dto = CreateUserDto.parse(body);
    const result = await createUser(ctx, dto);
    return NextResponse.json(
      { data: result, correlation_id: ctx.correlationId },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
