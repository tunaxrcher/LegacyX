import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@legacyx/db";
import { getRequestContext } from "../../../../shared/context";
import { toErrorResponse } from "../../../../shared/errors";
import { authorize } from "../../../../shared/auth";
import {
  CreatePatientDto,
  createPatient,
} from "../../../../modules/patient/patient.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    const body = await req.json();
    const dto = CreatePatientDto.parse(body);
    const created = await createPatient(ctx, dto);
    return NextResponse.json(
      { data: created, correlation_id: correlationId },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}

const ALLOWED_GENDERS = new Set(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]);
const ALLOWED_STATUSES = new Set(["ACTIVE", "INACTIVE", "MERGED"]);

export async function GET(req: NextRequest) {
  let correlationId: string | undefined;
  try {
    const ctx = await getRequestContext();
    correlationId = ctx.correlationId;
    await authorize(ctx, {
      resource: "patient",
      action: "read",
      target: { branchId: ctx.branchId },
    });
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const gender = (url.searchParams.get("gender") ?? "").trim().toUpperCase();
    const status = (url.searchParams.get("status") ?? "").trim().toUpperCase();

    // Pagination — accept either `page`/`per_page` (new standard) or the
    // legacy `limit` param that callers like the old /patients page used.
    const pageParam = Number(url.searchParams.get("page") ?? 1);
    const perPageParam = Number(
      url.searchParams.get("per_page") ?? url.searchParams.get("limit") ?? 25,
    );
    const page = Math.max(1, Number.isFinite(pageParam) ? pageParam : 1);
    const perPage = Math.min(
      100,
      Math.max(1, Number.isFinite(perPageParam) ? perPageParam : 25),
    );

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };
    if (q) {
      where.OR = [
        { hn: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
      ];
    }
    if (ALLOWED_GENDERS.has(gender)) where.gender = gender;
    if (ALLOWED_STATUSES.has(status)) where.status = status;

    const [total, rows] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          hn: true,
          firstName: true,
          lastName: true,
          gender: true,
          dob: true,
          status: true,
          linePictureUrl: true,
        },
      }),
    ]);

    return NextResponse.json({
      data: rows,
      pagination: { total, page, perPage },
      correlation_id: ctx.correlationId,
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
