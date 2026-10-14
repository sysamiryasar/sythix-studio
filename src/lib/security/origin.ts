import { AppError } from "../errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated endpoints. Session cookies are
 * SameSite=Lax; in addition, every state-changing request must carry an
 * Origin (or Referer) that matches the request host, and JSON bodies must be
 * sent as application/json (which forces a CORS preflight cross-origin).
 */
export function assertSameOrigin(req: Request, appUrl?: string): void {
  if (SAFE_METHODS.has(req.method)) return;
  const url = new URL(req.url);
  const allowed = new Set([url.origin]);
  // Behind adapters the request URL may be rewritten; the Host header is what the browser targeted.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
    allowed.add(`https://${host}`);
  }
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      /* ignore malformed APP_URL */
    }
  }
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowed.has(origin)) throw new AppError("forbidden", "Cross-origin request rejected.");
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (allowed.has(new URL(referer).origin)) return;
    } catch {
      /* fall through */
    }
  }
  throw new AppError("forbidden", "Missing request origin.");
}
