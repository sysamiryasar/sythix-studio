export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "module_disabled"
  | "unavailable"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  module_disabled: 503,
  unavailable: 503,
  internal: 500,
};

/** An error that is safe to show to the caller. Anything else is reported as `internal`. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found.`);
export const forbidden = (message = "You do not have permission to do that.") => new AppError("forbidden", message);
export const conflict = (message: string) => new AppError("conflict", message);
export const badRequest = (message: string, details?: unknown) => new AppError("bad_request", message, details);
