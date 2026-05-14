import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  issueMedicalCert,
  IssueMedicalCertDto,
} from "../../../../../../modules/document/document-issue.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const input = IssueMedicalCertDto.parse({ ...body, visit_id: params.id });
    const result = await issueMedicalCert(ctx, input);
    return NextResponse.json(
      { data: result, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
