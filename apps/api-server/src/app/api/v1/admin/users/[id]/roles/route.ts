import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "../../../../../../../shared/context";
import { toErrorResponse, BadRequest } from "../../../../../../../shared/errors";
import {
  UpdateUserDto,
  updateUser,
} from "../../../../../../../modules/admin/admin-users.service";

export const dynamic = "force-dynamic";

/**
 * Legacy "assign roles" endpoint — kept for back-compat. The new model is
 * single-role-per-user, so the request body now accepts either:
 *   • `{ role_code: "DOCTOR" }`     — new shape, single role
 *   • `{ role_codes: ["DOCTOR"] }`  — legacy shape; first entry wins, rest
 *                                    ignored (and we return 400 if the array
 *                                    has more than one role).
 */
const LegacyAssignRolesDto = z.object({
  role_codes: z.array(z.string()).optional(),
  role_code: z.string().min(1).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = LegacyAssignRolesDto.parse(await req.json());
    let roleCode = body.role_code;
    if (!roleCode && body.role_codes) {
      if (body.role_codes.length > 1) {
        throw BadRequest(
          "Multiple roles are no longer supported — assign one role per user",
        );
      }
      roleCode = body.role_codes[0];
    }
    if (!roleCode) throw BadRequest("role_code is required");
    const result = await updateUser(
      ctx,
      params.id,
      UpdateUserDto.parse({ role_code: roleCode }),
    );
    return NextResponse.json({
      data: result,
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
