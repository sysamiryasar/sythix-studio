import { z } from "zod";
import type { AppContext } from "../context";
import { AppError, conflict } from "../errors";
import { newId } from "../ids";
import { one, run } from "../db/sql";
import { DUMMY_PASSWORD_HASH, hashPassword, randomToken, sha256Hex, verifyPassword } from "../security/crypto";
import { enforceRateLimit, RATE_LIMITS } from "../security/rate-limit";
import { verifyTurnstile } from "../security/turnstile";
import { sendEmail } from "../email";
import { recordAudit } from "../audit";
import { notify } from "../notifications";
import { displayNameSchema, emailSchema, passwordSchema, usernameSchema } from "../validation";
import { createSession, revokeAllSessions } from "./session";
import { provisioningStatements } from "./onboarding";
import { awardAchievement } from "@/modules/nexusid/achievements";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export const registerInput = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
  password: passwordSchema,
  turnstileToken: z.string().max(4096).optional(),
});

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  turnstileToken: z.string().max(4096).optional(),
});

interface UserAuthRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  email_verified_at: number | null;
  status: string;
}

function appUrl(ctx: AppContext, path: string): string {
  return new URL(path, ctx.env.APP_URL).toString();
}

async function issueToken(ctx: AppContext, userId: string, kind: "email_verify" | "password_reset", ttl: number): Promise<string> {
  const token = randomToken(32);
  // Only the newest token of each kind is valid.
  await run(ctx.db, `UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL`, ctx.now(), userId, kind);
  await run(
    ctx.db,
    `INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    newId("tok"),
    userId,
    kind,
    await sha256Hex(token),
    ctx.now() + ttl,
    ctx.now(),
  );
  return token;
}

async function consumeToken(ctx: AppContext, token: string, kind: "email_verify" | "password_reset"): Promise<string> {
  const hash = await sha256Hex(token);
  const row = await one<{ id: string; user_id: string }>(
    ctx.db,
    `SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?`,
    hash,
    kind,
    ctx.now(),
  );
  if (!row) throw new AppError("bad_request", "This link is invalid or has expired.");
  const changed = await run(ctx.db, `UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL`, ctx.now(), row.id);
  if (!changed) throw new AppError("bad_request", "This link has already been used.");
  return row.user_id;
}

function ownerEmails(env: CloudflareEnv): Set<string> {
  return new Set((env.PLATFORM_OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

async function sendVerification(ctx: AppContext, user: { id: string; email: string }): Promise<void> {
  const token = await issueToken(ctx, user.id, "email_verify", VERIFY_TTL_MS);
  await sendEmail(ctx, {
    to: user.email,
    subject: "Verify your SythiX Studio account",
    text: `Welcome to SythiX Studio.\n\nVerify your email address to activate your account:\n${appUrl(ctx, `/verify-email?token=${token}`)}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
  });
}

/**
 * Creates an account. Registration never signs the user in: the account must
 * be verified by email first. A duplicate email returns the same response as a
 * new registration (the existing owner is emailed instead) to avoid account enumeration.
 */
export async function register(ctx: AppContext, raw: z.input<typeof registerInput>): Promise<{ status: "verification_sent" }> {
  const input = registerInput.parse(raw);
  await enforceRateLimit(ctx, RATE_LIMITS.register, ctx.ip ?? "unknown");
  await verifyTurnstile(ctx, input.turnstileToken);

  const lowered = input.password.toLowerCase();
  if (lowered.includes(input.username.toLowerCase()) || lowered === input.email) {
    throw new AppError("validation_failed", "Your password must not contain your username or email.");
  }

  const existingEmail = await one<{ id: string }>(ctx.db, `SELECT id FROM users WHERE email = ?`, input.email);
  if (existingEmail) {
    await sendEmail(ctx, {
      to: input.email,
      subject: "SythiX Studio sign-up attempt",
      text: `Someone tried to create a SythiX Studio account with this email address, but you already have one.\n\nSign in: ${appUrl(ctx, "/login")}\nForgot your password? ${appUrl(ctx, "/forgot-password")}`,
    });
    return { status: "verification_sent" };
  }
  if (await one(ctx.db, `SELECT 1 FROM users WHERE username = ?`, input.username)) {
    throw conflict("That username is already taken.");
  }

  const id = newId("usr");
  const now = ctx.now();
  const passwordHash = await hashPassword(input.password);
  await ctx.db.batch([
    ctx.db
      .prepare(`INSERT INTO users (id, email, password_hash, username, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, input.email, passwordHash, input.username, input.displayName ?? input.username, now, now),
    ...(await provisioningStatements(ctx, { id, username: input.username })),
  ]);
  await recordAudit(ctx, { actorId: id, action: "account.registered", targetType: "user", targetId: id });
  await sendVerification(ctx, { id, email: input.email });
  return { status: "verification_sent" };
}

export async function resendVerification(ctx: AppContext, email: string): Promise<void> {
  await enforceRateLimit(ctx, RATE_LIMITS.verifyResend, `${ctx.ip ?? "unknown"}:${email}`);
  const user = await one<{ id: string; email: string; email_verified_at: number | null }>(
    ctx.db,
    `SELECT id, email, email_verified_at FROM users WHERE email = ?`,
    email,
  );
  if (user && !user.email_verified_at) await sendVerification(ctx, user);
}

export async function verifyEmail(ctx: AppContext, token: string): Promise<void> {
  const userId = await consumeToken(ctx, token, "email_verify");
  const user = await one<{ email: string }>(ctx.db, `SELECT email FROM users WHERE id = ?`, userId);
  await run(ctx.db, `UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`, ctx.now(), ctx.now(), userId);
  if (user && ownerEmails(ctx.env).has(user.email.toLowerCase())) {
    await run(ctx.db, `UPDATE users SET platform_role = 'platform_owner' WHERE id = ?`, userId);
    await recordAudit(ctx, { actorType: "system", actorId: null, action: "platform.owner_granted", targetType: "user", targetId: userId });
  }
  await recordAudit(ctx, { actorId: userId, action: "account.email_verified", targetType: "user", targetId: userId });
  await awardAchievement(ctx, userId, "welcome");
}

export async function login(ctx: AppContext, raw: z.input<typeof loginInput>): Promise<{ token: string; expiresAt: number; userId: string }> {
  const input = loginInput.parse(raw);
  await enforceRateLimit(ctx, RATE_LIMITS.login, ctx.ip ?? "unknown");
  await enforceRateLimit(ctx, { ...RATE_LIMITS.login, name: "auth.login.account" }, input.email);

  const user = await one<UserAuthRow>(
    ctx.db,
    `SELECT id, email, username, password_hash, email_verified_at, status FROM users WHERE email = ?`,
    input.email,
  );
  // Always run the hash so response time does not reveal whether the account exists.
  const { ok, needsRehash } = await verifyPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    if (user) await recordAudit(ctx, { actorId: user.id, action: "account.login_failed", targetType: "user", targetId: user.id });
    throw new AppError("unauthenticated", "Incorrect email or password.");
  }
  if (user.status !== "active") throw new AppError("forbidden", "This account is suspended.");
  if (!user.email_verified_at) {
    throw new AppError("forbidden", "Verify your email address before signing in. Check your inbox or request a new link.", { reason: "email_unverified" });
  }
  if (needsRehash) {
    await run(ctx.db, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, await hashPassword(input.password), ctx.now(), user.id);
  }
  if (ownerEmails(ctx.env).has(user.email.toLowerCase())) {
    await run(ctx.db, `UPDATE users SET platform_role = 'platform_owner' WHERE id = ? AND platform_role <> 'platform_owner'`, user.id);
  }
  const session = await createSession(ctx, user.id);
  await recordAudit(ctx, { actorId: user.id, action: "account.login", targetType: "session", targetId: session.sessionId });
  return { token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

export async function requestPasswordReset(ctx: AppContext, email: string, turnstileToken?: string): Promise<void> {
  await enforceRateLimit(ctx, RATE_LIMITS.passwordReset, ctx.ip ?? "unknown");
  await verifyTurnstile(ctx, turnstileToken);
  const user = await one<{ id: string; email: string }>(ctx.db, `SELECT id, email FROM users WHERE email = ? AND status = 'active'`, email);
  if (!user) return; // Same response either way.
  const token = await issueToken(ctx, user.id, "password_reset", RESET_TTL_MS);
  await sendEmail(ctx, {
    to: user.email,
    subject: "Reset your SythiX Studio password",
    text: `A password reset was requested for your account.\n\nChoose a new password:\n${appUrl(ctx, `/reset-password?token=${token}`)}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
  });
}

export async function resetPassword(ctx: AppContext, token: string, newPassword: string): Promise<void> {
  passwordSchema.parse(newPassword);
  const userId = await consumeToken(ctx, token, "password_reset");
  await run(
    ctx.db,
    `UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`,
    await hashPassword(newPassword),
    ctx.now(),
    ctx.now(),
    userId,
  );
  const revoked = await revokeAllSessions(ctx, userId);
  await recordAudit(ctx, { actorId: userId, action: "account.password_reset", targetType: "user", targetId: userId, metadata: { sessionsRevoked: revoked } });
  await notify(ctx, userId, { kind: "security.event", title: "Your password was reset", body: "All other sessions were signed out.", link: "/settings/security" });
}

export async function changePassword(
  ctx: AppContext,
  user: { id: string; sessionId: string },
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  passwordSchema.parse(newPassword);
  await enforceRateLimit(ctx, RATE_LIMITS.login, `change:${user.id}`);
  const row = await one<{ password_hash: string }>(ctx.db, `SELECT password_hash FROM users WHERE id = ?`, user.id);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash)).ok) {
    throw new AppError("validation_failed", "Your current password is incorrect.");
  }
  await run(ctx.db, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, await hashPassword(newPassword), ctx.now(), user.id);
  const revoked = await revokeAllSessions(ctx, user.id, user.sessionId);
  await recordAudit(ctx, { actorId: user.id, action: "account.password_changed", targetType: "user", targetId: user.id, metadata: { sessionsRevoked: revoked } });
  await notify(ctx, user.id, { kind: "security.event", title: "Your password was changed", body: "Other sessions were signed out.", link: "/settings/security" });
}
