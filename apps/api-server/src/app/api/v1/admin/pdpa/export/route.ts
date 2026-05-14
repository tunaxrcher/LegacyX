import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse } from "../../../../../../shared/errors";
import {
  exportPatient,
  PdpaActionDto,
} from "../../../../../../modules/pdpa/pdpa.service";

export const dynamic = "force-dynamic";

/**
 * Returns the PDPA export manifest as a downloadable JSON file. Uses
 * Content-Disposition so browsers prompt a Save As dialog directly. We
 * return the entire manifest inline because it never crosses a public
 * network — the request is authed via session cookie.
 */
export async function POST(req: Request) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json().catch(() => ({}));
    const input = PdpaActionDto.parse(body);
    const out = await exportPatient(ctx, input);
    return NextResponse.json(
      { data: out, correlation_id: correlationId },
      {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="pdpa-export-${input.patient_id}.json"`,
        },
      },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
