import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "../../../../../../shared/context";
import { toErrorResponse, BadRequest } from "../../../../../../shared/errors";
import {
  uploadPatientPhoto,
  listPatientPhotos,
  PhotoKindSchema,
  UploadPhotoMetaDto,
} from "../../../../../../modules/patient_photo/patient-photo.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const sp = req.nextUrl.searchParams;
    const kindRaw = sp.get("kind") ?? undefined;
    const visitId = sp.get("visit_id") ?? undefined;
    const kind = kindRaw ? PhotoKindSchema.parse(kindRaw) : undefined;
    const data = await listPatientPhotos(ctx, params.id, {
      kind,
      visit_id: visitId,
    });
    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw BadRequest("file field is required (multipart/form-data)");
    }
    const meta = UploadPhotoMetaDto.parse({
      patient_id: params.id,
      kind: form.get("kind"),
      visit_id: form.get("visit_id") ?? undefined,
      region: form.get("region") ?? undefined,
      note: form.get("note") ?? undefined,
    });
    const buf = Buffer.from(await file.arrayBuffer());
    const data = await uploadPatientPhoto(ctx, {
      ...meta,
      buffer: buf,
      mimeType: (file.type || "").toLowerCase(),
      size: file.size,
    });
    return NextResponse.json(
      { data, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
