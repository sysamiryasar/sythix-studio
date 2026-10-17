import type { Env, Ctx } from "./env";
import { buildApi } from "./api";
import { ensureMigrated } from "./lib/migrate";
import { sweepOrphans } from "./services/media";
import { run } from "./lib/db";

export { RealtimeRoom } from "./realtime/room";

const api = buildApi();

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' wss: ws:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function withHeaders(res: Response): Response {
  if (res.status === 101) return res; // WebSocket upgrade
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return withHeaders(await api.fetch(req, env, ctx));
    // Everything else is the SPA (served by the assets binding; unknown paths get index.html).
    if (env.ASSETS) return withHeaders(await env.ASSETS.fetch(req));
    return new Response("Not found", { status: 404 });
  },

  /** Daily maintenance: orphaned uploads, expired sessions, stale counters, old notifications. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await ensureMigrated(env);
    const c: Ctx = { env, db: env.DB, now: () => Date.now(), ip: null, userAgent: null, waitUntil: (p) => ctx.waitUntil(p) };
    const now = Date.now();
    await sweepOrphans(c);
    await run(env.DB, `DELETE FROM sessions WHERE expires_at < ?`, now);
    await run(env.DB, `DELETE FROM rate_limits WHERE window_start < ?`, now - 86_400_000);
    await run(env.DB, `DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?`, now - 90 * 86_400_000);
  },
} satisfies ExportedHandler<Env>;
