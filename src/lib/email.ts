import type { AppContext } from "./context";
import { newId } from "./ids";
import { run } from "./db/sql";
import { log } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Delivers transactional email. With RESEND_API_KEY configured, mail is sent
 * through Resend's HTTP API. Otherwise it is only stored in `email_outbox`
 * (development: readable at /dev/outbox). Production without a provider logs
 * an error — it never pretends a message was delivered.
 */
export async function sendEmail(ctx: AppContext, msg: EmailMessage): Promise<{ delivered: boolean }> {
  const id = newId("eml");
  const apiKey = ctx.env.RESEND_API_KEY;
  let provider = "outbox";
  let status: "stored" | "sent" | "failed" = "stored";

  if (apiKey) {
    provider = "resend";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: ctx.env.EMAIL_FROM ?? "SythiX Studio <no-reply@sythix.invalid>", to: [msg.to], subject: msg.subject, text: msg.text }),
      });
      status = res.ok ? "sent" : "failed";
      if (!res.ok) log("error", "email.send_failed", { provider, status: res.status });
    } catch (err) {
      status = "failed";
      log("error", "email.send_failed", { provider, err });
    }
  } else if (ctx.env.APP_ENV === "production") {
    log("warn", "email.no_provider", { subject: msg.subject });
  }

  // Bodies contain single-use links. Once a provider delivered the message there is
  // no reason to keep it in production; undelivered messages are kept so a platform
  // owner can act on them (Studio → Users).
  const body = ctx.env.APP_ENV === "production" && status === "sent" ? "[redacted]" : msg.text;
  await run(
    ctx.db,
    `INSERT INTO email_outbox (id, to_email, subject, body_text, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    msg.to,
    msg.subject,
    body,
    provider,
    status,
    ctx.now(),
  );
  return { delivered: status === "sent" };
}

export function emailConfigured(env: CloudflareEnv): boolean {
  return !!env.RESEND_API_KEY;
}
