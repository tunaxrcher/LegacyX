import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  anonymizePatient,
  PdpaActionDto,
} from "../../../../../../modules/pdpa/pdpa.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const input = PdpaActionDto.parse(body);
    const out = await anonymizePatient(ctx, input);
    return NextResponse.json(
      { data: out, correlation_id: correlationId },
      { status: 200 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
