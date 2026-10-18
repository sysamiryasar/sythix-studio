import type { z } from "zod";
import type { Ctx } from "../env";
import type { Me } from "@shared/types";
import { DASHBOARD_WIDGETS, type registerSchema, type loginSchema, type profileSchema, type privacySchema, type preferencesSchema } from "@shared/schemas";
import type { PlatformRole } from "@shared/permissions";
import { all, one, run, stmt } from "../lib/db";
import { AppError, badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../lib/crypto";
import { createSession } from "../lib/session";
import { enforce, LIMIT } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import { avatarUrl, ACCENT_HEX } from "./users";
import { recount } from "./social";
import { deleteObjects } from "./media";

async function verifyTurnstile(ctx: Ctx, token: string | undefined): Promise<void> {
  const secret = ctx.env.TURNSTILE_SECRET_KEY;
  // Optional: only enforced when both keys are set, so the form can render the widget.
  if (!secret || !ctx.env.TURNSTILE_SITE_KEY) return;
  if (!token) throw badRequest("Complete the human check.");
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ctx.ip) form.append("remoteip", ctx.ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(5000) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { success?: boolean } | null;
  if (!json?.success) throw badRequest("Human check failed. Please try again.");
}

export async function register(ctx: Ctx, input: z.infer<typeof registerSchema>) {
  await enforce(ctx, LIMIT.register, ctx.ip ?? "unknown");
  await verifyTurnstile(ctx, input.turnstileToken);
  if (await one(ctx.db, `SELECT 1 FROM users WHERE username = ?`, input.username)) throw conflict("That username is taken.");
  if (await one(ctx.db, `SELECT 1 FROM users WHERE email = ?`, input.email)) throw conflict("An account with that email already exists. Try signing in.");

  const owners = new Set((ctx.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const first = !(await one(ctx.db, `SELECT 1 FROM users LIMIT 1`));
  const role: PlatformRole = owners.has(input.email) || (owners.size === 0 && first) ? "owner" : "member";
  const id = newId("usr");
  const now = ctx.now();
  try {
    await ctx.db.batch([
      stmt(ctx.db, `INSERT INTO users (id, email, username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, input.email, input.username, input.displayName, await hashPassword(input.password), role, now, now),
      stmt(ctx.db, `INSERT INTO profiles (user_id) VALUES (?)`, id),
      stmt(ctx.db, `INSERT INTO preferences (user_id) VALUES (?)`, id),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test((err as Error).message)) throw conflict("That username or email is already in use.");
    throw err;
  }
  await audit(ctx, { actorId: id, action: role === "owner" ? "account.created_owner" : "account.created", targetType: "user", targetId: id });
  return { userId: id, role, ...(await createSession(ctx, id)) };
}

export async function login(ctx: Ctx, input: z.infer<typeof loginSchema>) {
  const ident = input.identifier.toLowerCase();
  await enforce(ctx, LIMIT.login, `${ctx.ip ?? "unknown"}:${ident}`);
  const u = await one<{ id: string; password_hash: string; status: string }>(ctx.db, `SELECT id, password_hash, status FROM users WHERE email = ? OR username = ?`, ident, input.identifier);
  const okPw = await verifyPassword(input.password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !okPw) throw new AppError("unauthenticated", "Incorrect email/username or password.");
  if (u.status !== "active") throw new AppError("forbidden", "This account is suspended. Contact the platform team.");
  await audit(ctx, { actorId: u.id, action: "account.login", targetType: "user", targetId: u.id });
  return createSession(ctx, u.id);
}

export async function logout(ctx: Ctx, sessionId: string) {
  await run(ctx.db, `DELETE FROM sessions WHERE id = ?`, sessionId);
}

function normaliseDashboard(raw: string): Me["preferences"]["dashboard"] {
  let parsed: { id: string; visible: boolean }[] = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  const known = new Set<string>(DASHBOARD_WIDGETS);
  const out = parsed.filter((w) => known.has(w.id)) as Me["preferences"]["dashboard"];
  for (const id of DASHBOARD_WIDGETS) if (!out.some((w) => w.id === id)) out.push({ id, visible: true });
  return out;
}

export async function getMe(ctx: Ctx, userId: string): Promise<Me> {
  const r = await one<Record<string, string | number | null>>(
    ctx.db,
    `SELECT u.id, u.email, u.username, u.display_name, u.role, u.created_at,
            p.bio, p.location, p.website, p.pronouns, p.accent, p.banner, p.avatar_key, p.profile_visibility, p.dm_policy, p.allow_mentions, p.show_activity,
            pf.theme, pf.reduced_motion, pf.nav_collapsed, pf.dashboard
       FROM users u JOIN profiles p ON p.user_id = u.id JOIN preferences pf ON pf.user_id = u.id WHERE u.id = ?`,
    userId,
  );
  if (!r) throw notFound("Account");
  return {
    id: String(r.id),
    username: String(r.username),
    displayName: String(r.display_name),
    email: String(r.email),
    role: r.role as PlatformRole,
    createdAt: Number(r.created_at),
    accent: ACCENT_HEX[String(r.accent)] ?? ACCENT_HEX.violet!,
    avatarUrl: avatarUrl(String(r.id), (r.avatar_key as string | null) ?? null),
    profile: {
      bio: String(r.bio),
      location: String(r.location),
      website: String(r.website),
      pronouns: String(r.pronouns),
      banner: String(r.banner),
      profileVisibility: r.profile_visibility as Me["profile"]["profileVisibility"],
      dmPolicy: r.dm_policy as Me["profile"]["dmPolicy"],
      allowMentions: !!r.allow_mentions,
      showActivity: !!r.show_activity,
    },
    preferences: {
      theme: r.theme as Me["preferences"]["theme"],
      reducedMotion: !!r.reduced_motion,
      navCollapsed: !!r.nav_collapsed,
      dashboard: normaliseDashboard(String(r.dashboard)),
    },
  };
}

/** Raw accent name (for the settings form). */
export async function getAccentName(ctx: Ctx, userId: string): Promise<string> {
  return (await one<{ accent: string }>(ctx.db, `SELECT accent FROM profiles WHERE user_id = ?`, userId))?.accent ?? "violet";
}

export async function updateProfile(ctx: Ctx, userId: string, p: z.infer<typeof profileSchema>) {
  await ctx.db.batch([
    stmt(ctx.db, `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, p.displayName, ctx.now(), userId),
    stmt(ctx.db, `UPDATE profiles SET bio = ?, location = ?, website = ?, pronouns = ?, accent = ?, banner = ? WHERE user_id = ?`, p.bio, p.location, p.website, p.pronouns, p.accent, p.banner, userId),
  ]);
}

export async function updatePrivacy(ctx: Ctx, userId: string, p: z.infer<typeof privacySchema>) {
  await run(ctx.db, `UPDATE profiles SET profile_visibility = ?, dm_policy = ?, allow_mentions = ?, show_activity = ? WHERE user_id = ?`, p.profileVisibility, p.dmPolicy, p.allowMentions ? 1 : 0, p.showActivity ? 1 : 0, userId);
}

export async function updatePreferences(ctx: Ctx, userId: string, p: z.infer<typeof preferencesSchema>) {
  await run(ctx.db, `UPDATE preferences SET theme = ?, reduced_motion = ?, nav_collapsed = ?, dashboard = ? WHERE user_id = ?`, p.theme, p.reducedMotion ? 1 : 0, p.navCollapsed ? 1 : 0, JSON.stringify(p.dashboard), userId);
}

export async function changePassword(ctx: Ctx, userId: string, sessionId: string, current: string, next: string) {
  await enforce(ctx, LIMIT.login, `pw:${userId}`);
  const u = await one<{ password_hash: string }>(ctx.db, `SELECT password_hash FROM users WHERE id = ?`, userId);
  if (!u || !(await verifyPassword(current, u.password_hash))) throw badRequest("Your current password is incorrect.");
  await ctx.db.batch([
    stmt(ctx.db, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, await hashPassword(next), ctx.now(), userId),
    stmt(ctx.db, `DELETE FROM sessions WHERE user_id = ? AND id <> ?`, userId, sessionId),
  ]);
  await audit(ctx, { actorId: userId, action: "account.password_changed", targetType: "user", targetId: userId });
}

export async function listSessions(ctx: Ctx, userId: string, currentId: string) {
  const rows = await all<{ id: string; ip: string | null; user_agent: string | null; created_at: number; last_seen_at: number }>(
    ctx.db,
    `SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
    userId,
    ctx.now(),
  );
  return rows.map((r) => ({ id: r.id, ip: r.ip, userAgent: r.user_agent, createdAt: r.created_at, lastSeenAt: r.last_seen_at, current: r.id === currentId }));
}

export async function revokeSession(ctx: Ctx, userId: string, id: string) {
  await run(ctx.db, `DELETE FROM sessions WHERE id = ? AND user_id = ?`, id, userId);
}

/** Everything we store about the user, as JSON (GDPR-style portability). Media files are listed by id. */
export async function exportData(ctx: Ctx, userId: string) {
  const q = <T>(sql: string) => all<T>(ctx.db, sql, userId);
  const [account] = await Promise.all([q<Record<string, unknown>>(`SELECT id, email, username, display_name, role, created_at FROM users WHERE id = ?`)]);
  return {
    exportedAt: new Date(ctx.now()).toISOString(),
    format: "sythix-unite-export/1",
    account: account[0],
    profile: (await q(`SELECT bio, location, website, pronouns, accent, banner, profile_visibility, dm_policy, allow_mentions, show_activity FROM profiles WHERE user_id = ?`))[0],
    preferences: (await q(`SELECT theme, reduced_motion, nav_collapsed, dashboard FROM preferences WHERE user_id = ?`))[0],
    posts: await q(`SELECT id, body, visibility, repost_of, created_at, edited_at FROM posts WHERE author_id = ? ORDER BY created_at`),
    comments: await q(`SELECT id, post_id, parent_id, body, created_at FROM comments WHERE author_id = ? AND deleted = 0 ORDER BY created_at`),
    reactions: await q(`SELECT post_id, kind, created_at FROM reactions WHERE user_id = ?`),
    bookmarks: await q(`SELECT post_id, created_at FROM bookmarks WHERE user_id = ?`),
    following: await q(`SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?`),
    followers: await q(`SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ?`),
    blocked: await q(`SELECT u.username, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?`),
    media: await q(`SELECT id, kind, content_type, size_bytes, post_id, created_at FROM media WHERE owner_id = ?`),
    communities: await q(`SELECT c.slug, m.role, m.joined_at FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.user_id = ?`),
    messages: await q(`SELECT id, channel_id, conversation_id, body, created_at FROM messages WHERE author_id = ? AND deleted_at IS NULL ORDER BY created_at`),
    sessions: await q(`SELECT ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ?`),
  };
}

/** Permanently deletes the account, its content (cascades) and its stored files. */
export async function deleteAccount(ctx: Ctx, userId: string, password: string) {
  const u = await one<{ password_hash: string; role: string }>(ctx.db, `SELECT password_hash, role FROM users WHERE id = ?`, userId);
  if (!u || !(await verifyPassword(password, u.password_hash))) throw badRequest("Password is incorrect.");
  if (u.role === "owner") {
    const owners = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM users WHERE role = 'owner'`);
    if ((owners?.n ?? 0) <= 1) throw badRequest("You are the only platform owner. Make someone else an owner first.");
  }
  const owned = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM communities WHERE owner_id = ?`, userId);
  if ((owned?.n ?? 0) > 0) throw badRequest("Transfer or delete the communities you own first.");
  const keys = await all<{ r2_key: string }>(ctx.db, `SELECT r2_key FROM media WHERE owner_id = ? UNION SELECT avatar_key AS r2_key FROM profiles WHERE user_id = ? AND avatar_key IS NOT NULL`, userId, userId);
  // Counters on other people's posts that this account's rows contributed to.
  const touched = await all<{ id: string }>(
    ctx.db,
    `SELECT post_id AS id FROM reactions WHERE user_id = ? UNION SELECT post_id FROM comments WHERE author_id = ? UNION SELECT repost_of FROM posts WHERE author_id = ? AND repost_of IS NOT NULL`,
    userId,
    userId,
    userId,
  );
  await run(ctx.db, `DELETE FROM users WHERE id = ?`, userId);
  await recount(ctx, touched.map((t) => t.id));
  deleteObjects(ctx, keys.map((k) => k.r2_key));
  await audit(ctx, { actorId: null, action: "account.deleted", targetType: "user", targetId: userId });
}
