import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ContextError } from "./context";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const BadRequest = (msg: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", msg, details);
export const Unauthorized = (msg = "Unauthorized") =>
  new HttpError(401, "UNAUTHORIZED", msg);
export const Forbidden = (msg = "Forbidden") =>
  new HttpError(403, "FORBIDDEN", msg);
export const NotFound = (msg = "Not found") =>
  new HttpError(404, "NOT_FOUND", msg);
export const Conflict = (msg: string) => new HttpError(409, "CONFLICT", msg);

export function toErrorResponse(err: unknown, correlationId?: string) {
  if (err instanceof HttpError) {
    return NextResponse.json(
      {
        error: { code: err.code, message: err.message, details: err.details },
        correlation_id: correlationId,
      },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request payload failed validation",
          details: err.flatten(),
        },
        correlation_id: correlationId,
      },
      { status: 422 },
    );
  }
  if (err instanceof ContextError) {
    const code = err.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return NextResponse.json(
      {
        error: { code, message: err.message },
        correlation_id: correlationId,
      },
      { status: err.status },
    );
  }
  console.error("[unhandled]", correlationId, err);
  return NextResponse.json(
    {
      error: { code: "INTERNAL", message: "Internal server error" },
      correlation_id: correlationId,
    },
    { status: 500 },
  );
}
