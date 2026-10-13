import { ZodError, type z } from "zod";
import { getAppContext, type AppContext } from "../context";
import { AppError } from "../errors";
import { log } from "../logger";
import { resolveSession, sessionCookieName, sessionCookieOptions, type SessionUser } from "../auth/session";
import { assertSameOrigin } from "../security/origin";
import { enforceRateLimit, RATE_LIMITS } from "../security/rate-limit";
import { parseCookies, serializeCookie } from "./cookies";
import { assertModuleEnabled } from "@/modules/service";
import type { ModuleId } from "@/modules/types";

export interface HandlerArgs<P> {
  req: Request;
  ctx: AppContext;
  params: P;
  /** Present when auth is "required". */
  user: SessionUser;
  /** Parse and validate the JSON body. */
  body: <S extends z.ZodType>(schema: S) => Promise<z.infer<S>>;
  query: URLSearchParams;
}

interface RouteOptions {
  auth?: "required" | "optional" | "none";
  module?: ModuleId;
}

type RouteContext<P> = { params: Promise<P> };

const MAX_JSON_BYTES = 256 * 1024;

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    const retry = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
    if (err.code === "rate_limited" && retry) headers["retry-after"] = String(retry);
    return jsonResponse({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status, headers });
  }
  if (err instanceof ZodError) {
    return jsonResponse(
      {
        error: {
          code: "validation_failed",
          message: err.issues[0]?.message ?? "Invalid input.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  log("error", "api.unhandled", { err });
  return jsonResponse({ error: { code: "internal", message: "Something went wrong. The error has been logged." } }, { status: 500 });
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) throw new AppError("bad_request", "Expected an application/json body.");
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new AppError("bad_request", "Request body is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("bad_request", "Malformed JSON body.");
  }
  return schema.parse(raw);
}

export async function sessionFromRequest(ctx: AppContext, req: Request): Promise<SessionUser | null> {
  const cookies = parseCookies(req.headers.get("cookie"));
  return resolveSession(ctx, cookies[sessionCookieName(ctx.env)]);
}

export function sessionCookieHeader(env: CloudflareEnv, token: string, expiresAt: number): string {
  return serializeCookie(sessionCookieName(env), token, sessionCookieOptions(env, new Date(expiresAt)));
}

export function clearSessionCookieHeader(env: CloudflareEnv): string {
  return serializeCookie(sessionCookieName(env), "", { ...sessionCookieOptions(env, new Date(0)), maxAge: 0 });
}

/**
 * Wraps a Next.js route handler with: context, module gating, CSRF origin
 * checks, session auth, per-user mutation rate limits and uniform error JSON.
 */
export function route<P = Record<string, string>>(opts: RouteOptions, handler: (args: HandlerArgs<P>) => Promise<unknown>) {
  return async (req: Request, routeCtx: RouteContext<P>): Promise<Response> => {
    try {
      const ctx = await getAppContext(req);
      if (opts.module) await assertModuleEnabled(ctx, opts.module);
      assertSameOrigin(req, ctx.env.APP_URL);
      const auth = opts.auth ?? "required";
      const user = auth === "none" ? null : await sessionFromRequest(ctx, req);
      if (auth === "required" && !user) throw new AppError("unauthenticated", "Sign in to continue.");
      if (user && req.method !== "GET" && req.method !== "HEAD") await enforceRateLimit(ctx, RATE_LIMITS.mutation, user.id);
      const params = ((await routeCtx?.params) ?? {}) as P;
      const result = await handler({
        req,
        ctx,
        params,
        user: user as SessionUser,
        body: (schema) => readJson(req, schema),
        query: new URL(req.url).searchParams,
      });
      if (result instanceof Response) return result;
      return jsonResponse({ data: result ?? null });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
