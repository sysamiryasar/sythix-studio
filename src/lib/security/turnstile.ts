import type { AppContext } from "../context";
import { AppError } from "../errors";
import { log } from "../logger";

/**
 * Verifies a Cloudflare Turnstile token server-side.
 * When no secret is configured outside production, verification is skipped
 * (and logged) so local development works without Cloudflare credentials.
 * In production a missing secret is a hard failure.
 */
export async function verifyTurnstile(ctx: AppContext, token: string | undefined | null): Promise<void> {
  const secret = ctx.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (ctx.env.APP_ENV === "production") throw new AppError("unavailable", "Abuse protection is not configured.");
    log("warn", "turnstile.skipped", { reason: "TURNSTILE_SECRET_KEY not set" });
    return;
  }
  if (!token) throw new AppError("bad_request", "Please complete the verification challenge.");
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ctx.ip) form.append("remoteip", ctx.ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({ success: false }))) as { success: boolean; "error-codes"?: string[] };
  if (!data.success) {
    log("info", "turnstile.failed", { codes: data["error-codes"] });
    throw new AppError("bad_request", "Verification challenge failed. Please try again.");
  }
}
