import { Hono, type Context } from "hono";
import { ZodError, type z } from "zod";
import type { Ctx, Env } from "./env";
import { AppError } from "./lib/errors";
import { cookieName, readCookie, resolveSession, type SessionUser } from "./lib/session";
import { enforce, LIMIT } from "./lib/rate-limit";
import { ensureMigrated } from "./lib/migrate";

export type AppEnv = { Bindings: Env; Variables: { ctx: Ctx; user: SessionUser | null } };
export type C = Context<AppEnv>;

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use("*", async (c, next) => {
    await ensureMigrated(c.env);
    const ctx: Ctx = {
      env: c.env,
      db: c.env.DB,
      now: () => Date.now(),
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      waitUntil: (p) => {
        try {
          c.executionCtx.waitUntil(p);
        } catch {
          void p; // no execution context (tests)
        }
      },
    };
    c.set("ctx", ctx);

    // CSRF: state-changing requests must come from this origin.
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = c.req.header("origin");
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      let ok = false;
      if (origin && host) {
        try {
          ok = new URL(origin).host === host;
        } catch {
          ok = false;
        }
      } else if (!origin) {
        ok = c.req.header("sec-fetch-site") === "same-origin";
      }
      if (!ok) throw new AppError("forbidden", "Cross-site request blocked.");
    }

    const user = await resolveSession(ctx, readCookie(c.req.header("cookie"), cookieName(c.env)));
    c.set("user", user);
    if (user && method !== "GET" && method !== "HEAD") await enforce(ctx, LIMIT.mutation, user.id);
    await next();
    c.header("cache-control", "no-store");
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      const retry = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
      if (retry) c.header("retry-after", String(retry));
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    if (err instanceof ZodError) {
      return c.json(
        { error: { code: "validation_failed", message: err.issues[0]?.message ?? "Invalid input.", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
        422,
      );
    }
    console.error(JSON.stringify({ level: "error", event: "api.unhandled", message: (err as Error).message, stack: (err as Error).stack }));
    return c.json({ error: { code: "internal", message: "Something went wrong. It has been logged." } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "No such API route." } }, 404));
  return app;
}

export function requireUser(c: C): SessionUser {
  const u = c.get("user");
  if (!u) throw new AppError("unauthenticated", "Sign in to continue.");
  return u;
}

const MAX_JSON = 128 * 1024;
export async function body<S extends z.ZodType>(c: C, schema: S): Promise<z.infer<S>> {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new AppError("bad_request", "Expected a JSON body.");
  const text = await c.req.text();
  if (text.length > MAX_JSON) throw new AppError("payload_too_large", "Request body is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("bad_request", "Malformed JSON.");
  }
  return schema.parse(raw);
}

export const ok = (c: C, data: unknown, status: 200 | 201 = 200) => c.json({ data }, status);
