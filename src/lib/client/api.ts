"use client";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Typed JSON fetch against the SythiX API. Throws ApiClientError with the server's message. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
  });
  let payload: { data?: T; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || payload.error) {
    throw new ApiClientError(payload.error?.code ?? "internal", payload.error?.message ?? `Request failed (${res.status}).`, res.status, payload.error?.details);
  }
  return payload.data as T;
}
