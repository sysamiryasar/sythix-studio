export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media"
  | "rate_limited"
  | "unavailable"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media: 415,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

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

export const badRequest = (m: string) => new AppError("bad_request", m);
export const forbidden = (m = "You don't have permission to do that.") => new AppError("forbidden", m);
export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found.`);
export const conflict = (m: string) => new AppError("conflict", m);
