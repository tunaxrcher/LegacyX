import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { toErrorResponse } from "../../../../../shared/errors";
import {
  PublicBookDto,
  publicBook,
} from "../../../../../modules/public_catalog/public_catalog.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = PublicBookDto.parse(body);
    const correlationId = req.headers.get("x-correlation-id") ?? randomUUID();
    const out = await publicBook(dto, correlationId);
    return NextResponse.json({ data: out });
  } catch (err) {
    return toErrorResponse(err);
  }
}
