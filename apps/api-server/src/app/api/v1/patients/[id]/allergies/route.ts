import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  AddAllergyDto,
  addAllergy,
  listAllergies,
} from "../../../../../../modules/allergy/allergy.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await listAllergies(ctx, params.id);
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const input = AddAllergyDto.parse(body);
    const data = await addAllergy(ctx, params.id, input);
    return NextResponse.json(
      { data, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
