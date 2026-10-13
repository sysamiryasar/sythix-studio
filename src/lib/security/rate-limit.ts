import type { AppContext } from "../context";
import { AppError } from "../errors";

export interface RateLimitRule {
  /** Logical bucket name, e.g. "auth.login". */
  name: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  login: { name: "auth.login", limit: 10, windowMs: 15 * 60_000 },
  register: { name: "auth.register", limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { name: "auth.reset", limit: 5, windowMs: 60 * 60_000 },
  verifyResend: { name: "auth.verify", limit: 5, windowMs: 60 * 60_000 },
  mutation: { name: "api.mutation", limit: 120, windowMs: 60_000 },
  upload: { name: "forge.upload", limit: 30, windowMs: 10 * 60_000 },
  export: { name: "forge.export", limit: 20, windowMs: 10 * 60_000 },
  serverCommand: { name: "server.command", limit: 30, windowMs: 60_000 },
  report: { name: "nexus.report", limit: 10, windowMs: 60 * 60_000 },
  agent: { name: "agent.request", limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter in D1. Atomic per key via a single UPSERT.
 * Throws `rate_limited` when the limit is exceeded.
 */
export async function enforceRateLimit(ctx: AppContext, rule: RateLimitRule, subject: string): Promise<void> {
  const now = ctx.now();
  const windowStart = now - (now % rule.windowMs);
  const key = `${rule.name}:${subject}`;
  const row = await ctx.db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > rule.limit) {
    const retryAfter = Math.ceil((windowStart + rule.windowMs - now) / 1000);
    throw new AppError("rate_limited", `Too many requests. Try again in ${retryAfter} seconds.`, { retryAfter });
  }
}

/** Retention: drop counters whose window ended more than a day ago. */
export async function pruneRateLimits(ctx: AppContext): Promise<void> {
  await ctx.db.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(ctx.now() - 86_400_000).run();
}
