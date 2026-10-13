import type { AppContext } from "../context";
import { newId } from "../ids";
import { one, run, all } from "../db/sql";
import { randomToken, sha256Hex } from "../security/crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type PlatformRole = "member" | "platform_admin" | "platform_owner";

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  platformRole: PlatformRole;
  emailVerified: boolean;
  sessionId: string;
}

/** `__Host-` prefix pins the cookie to this exact host over HTTPS with Path=/. */
export function sessionCookieName(env: CloudflareEnv): string {
  return env.APP_ENV === "development" || env.APP_ENV === "test" ? "sythix_session" : "__Host-sythix_session";
}

export function sessionCookieOptions(env: CloudflareEnv, expires: Date) {
  return {
    httpOnly: true,
    secure: env.APP_ENV !== "development" && env.APP_ENV !== "test",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(ctx: AppContext, userId: string): Promise<{ token: string; expiresAt: number; sessionId: string }> {
  const token = randomToken(32);
  const id = newId("ses");
  const now = ctx.now();
  const expiresAt = now + SESSION_TTL_MS;
  await run(
    ctx.db,
    `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    await sha256Hex(token),
    now,
    now,
    expiresAt,
    ctx.ip,
    ctx.userAgent,
  );
  return { token, expiresAt, sessionId: id };
}

interface SessionJoinRow {
  session_id: string;
  last_seen_at: number;
  expires_at: number;
  id: string;
  email: string;
  username: string;
  display_name: string;
  platform_role: PlatformRole;
  email_verified_at: number | null;
}

export async function resolveSession(ctx: AppContext, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const now = ctx.now();
  const row = await one<SessionJoinRow>(
    ctx.db,
    `SELECT s.id AS session_id, s.last_seen_at, s.expires_at,
            u.id, u.email, u.username, u.display_name, u.platform_role, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
    await sha256Hex(token),
    now,
  );
  if (!row) return null;
  if (now - row.last_seen_at > TOUCH_INTERVAL_MS) {
    // Sliding expiry: extend while the session is in use.
    await run(ctx.db, `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`, now, now + SESSION_TTL_MS, row.session_id);
  }
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    platformRole: row.platform_role,
    emailVerified: row.email_verified_at != null,
    sessionId: row.session_id,
  };
}

export async function revokeSession(ctx: AppContext, userId: string, sessionId: string): Promise<boolean> {
  return (await run(ctx.db, `UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, ctx.now(), sessionId, userId)) > 0;
}

export async function revokeAllSessions(ctx: AppContext, userId: string, exceptSessionId?: string): Promise<number> {
  return run(
    ctx.db,
    `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?`,
    ctx.now(),
    userId,
    exceptSessionId ?? "",
  );
}

export interface SessionInfo {
  id: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  ip: string | null;
  user_agent: string | null;
}

export async function listSessions(ctx: AppContext, userId: string): Promise<SessionInfo[]> {
  return all<SessionInfo>(
    ctx.db,
    `SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`,
    userId,
    ctx.now(),
  );
}

/** Retention: expired or revoked sessions are deleted after 30 days. */
export async function pruneSessions(ctx: AppContext): Promise<void> {
  const cutoff = ctx.now() - 30 * 86_400_000;
  await run(ctx.db, `DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`, cutoff, cutoff);
}
