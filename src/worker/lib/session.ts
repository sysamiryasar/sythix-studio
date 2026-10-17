import type { Ctx } from "../env";
import type { PlatformRole } from "@shared/permissions";
import { one, run } from "./db";
import { newId, randomToken } from "./ids";
import { sha256Hex } from "./crypto";

export const SESSION_TTL_MS = 30 * 86_400_000;
const TOUCH_INTERVAL_MS = 10 * 60_000;

export interface SessionUser {
  id: string;
  sessionId: string;
  username: string;
  displayName: string;
  email: string;
  role: PlatformRole;
}

export function cookieName(env: { APP_ENV?: string }) {
  // __Host- requires Secure; plain http on localhost cannot set it.
  return env.APP_ENV === "development" || env.APP_ENV === "test" ? "sx_session" : "__Host-sx_session";
}

export function sessionCookie(env: { APP_ENV?: string }, token: string, maxAgeSec: number): string {
  const secure = env.APP_ENV === "development" || env.APP_ENV === "test" ? "" : "; Secure";
  return `${cookieName(env)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export async function createSession(ctx: Ctx, userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken(32);
  const now = ctx.now();
  const expiresAt = now + SESSION_TTL_MS;
  await run(
    ctx.db,
    `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("ses"),
    userId,
    await sha256Hex(token),
    ctx.ip,
    ctx.userAgent?.slice(0, 200) ?? null,
    now,
    now,
    expiresAt,
  );
  return { token, expiresAt };
}

export async function resolveSession(ctx: Ctx, token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const row = await one<{ session_id: string; last_seen_at: number; expires_at: number; id: string; username: string; display_name: string; email: string; role: PlatformRole; status: string }>(
    ctx.db,
    `SELECT s.id AS session_id, s.last_seen_at, s.expires_at, u.id, u.username, u.display_name, u.email, u.role, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    await sha256Hex(token),
  );
  if (!row || row.expires_at < ctx.now() || row.status !== "active") return null;
  if (ctx.now() - row.last_seen_at > TOUCH_INTERVAL_MS) {
    ctx.waitUntil(run(ctx.db, `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`, ctx.now(), ctx.now() + SESSION_TTL_MS, row.session_id));
  }
  return { id: row.id, sessionId: row.session_id, username: row.username, displayName: row.display_name, email: row.email, role: row.role };
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
