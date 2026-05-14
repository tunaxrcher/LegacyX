import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  captureConsent,
  listConsents,
  CaptureConsentDto,
} from "../../../../../../modules/consent/consent.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const data = await listConsents(ctx, params.id);
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
    const h = headers();
    // Forensics — populated server-side. Client cannot spoof these because
    // we ignore body.ip / body.user_agent and use Next's headers() helper.
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      undefined;
    const userAgent = h.get("user-agent") ?? undefined;
    const input = CaptureConsentDto.parse({
      ...body,
      patient_id: params.id,
      ip,
      user_agent: userAgent,
    });
    const result = await captureConsent(ctx, input);
    return NextResponse.json(
      { data: result, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
