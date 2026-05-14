import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  findDuplicates,
  FindDuplicatesQuery,
} from "../../../../../../modules/patient_merge/merge.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const url = new URL(req.url);
    const input = FindDuplicatesQuery.parse({
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const data = await findDuplicates(ctx, input);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
