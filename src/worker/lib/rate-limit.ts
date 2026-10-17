import type { Ctx } from "../env";
import { AppError } from "./errors";

export interface Rule {
  name: string;
  limit: number;
  windowMs: number;
}

const MIN = 60_000;
export const LIMIT = {
  register: { name: "auth.register", limit: 5, windowMs: 60 * MIN },
  login: { name: "auth.login", limit: 10, windowMs: 15 * MIN },
  mutation: { name: "api.mutation", limit: 120, windowMs: MIN },
  post: { name: "social.post", limit: 30, windowMs: 60 * MIN },
  comment: { name: "social.comment", limit: 60, windowMs: 10 * MIN },
  upload: { name: "media.upload", limit: 40, windowMs: 60 * MIN },
  message: { name: "connect.message", limit: 30, windowMs: 10_000 },
  report: { name: "safety.report", limit: 20, windowMs: 60 * MIN },
  community: { name: "connect.community", limit: 5, windowMs: 60 * MIN },
  search: { name: "search", limit: 60, windowMs: MIN },
} satisfies Record<string, Rule>;

/** Fixed-window counter in D1 (one atomic UPSERT). Throws `rate_limited` over the limit. */
export async function enforce(ctx: Ctx, rule: Rule, subject: string): Promise<void> {
  const now = ctx.now();
  const windowStart = now - (now % rule.windowMs);
  const row = await ctx.db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(`${rule.name}:${subject}`, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > rule.limit) {
    const retryAfter = Math.ceil((windowStart + rule.windowMs - now) / 1000);
    throw new AppError("rate_limited", `Slow down — try again in ${retryAfter}s.`, { retryAfter });
  }
}
