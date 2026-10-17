import type { Ctx } from "../env";
import type { UserSummary, ProfileView } from "@shared/types";
import { all, inList, one, run, stmt } from "../lib/db";
import { notFound, badRequest } from "../lib/errors";
import { notify } from "./notifications";

export const ACCENT_HEX: Record<string, string> = { violet: "#8b5cf6", cyan: "#22d3ee", magenta: "#e879f9", emerald: "#34d399", amber: "#fbbf24" };

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  accent: string | null;
  avatar_key: string | null;
}

export const USER_COLS = `u.id, u.username, u.display_name, pr.accent, pr.avatar_key`;

export function avatarUrl(userId: string, key: string | null): string | null {
  if (!key) return null;
  return `/api/avatars/${userId}?v=${encodeURIComponent(key.slice(-8))}`;
}

export function toSummary(r: UserRow): UserSummary {
  return { id: r.id, username: r.username, displayName: r.display_name, accent: ACCENT_HEX[r.accent ?? "violet"] ?? ACCENT_HEX.violet!, avatarUrl: avatarUrl(r.id, r.avatar_key) };
}

export async function summariesById(ctx: Ctx, ids: string[]): Promise<Map<string, UserSummary>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const rows = await all<UserRow>(ctx.db, `SELECT ${USER_COLS} FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id WHERE u.id IN (${inList(uniq.length)})`, ...uniq);
  return new Map(rows.map((r) => [r.id, toSummary(r)]));
}

export async function findByUsername(ctx: Ctx, username: string) {
  return one<UserRow & { status: string; created_at: number }>(
    ctx.db,
    `SELECT ${USER_COLS}, u.status, u.created_at FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id WHERE u.username = ?`,
    username.trim(),
  );
}

export async function isBlockedEither(ctx: Ctx, a: string, b: string): Promise<boolean> {
  return !!(await one(ctx.db, `SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`, a, b, b, a));
}

export async function isFollowing(ctx: Ctx, follower: string, followee: string): Promise<boolean> {
  return !!(await one(ctx.db, `SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?`, follower, followee));
}

/** Whether `viewer` may see `ownerId`'s profile content (posts, media, lists). */
export async function canViewProfileContent(ctx: Ctx, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if (await isBlockedEither(ctx, viewerId, ownerId)) return false;
  const p = await one<{ profile_visibility: string }>(ctx.db, `SELECT profile_visibility FROM profiles WHERE user_id = ?`, ownerId);
  const vis = p?.profile_visibility ?? "public";
  if (vis === "public") return true;
  if (vis === "followers") return isFollowing(ctx, viewerId, ownerId);
  return false;
}

export async function getProfile(ctx: Ctx, viewerId: string, username: string): Promise<ProfileView> {
  const u = await findByUsername(ctx, username);
  // Suspended accounts and accounts that blocked the viewer look like missing ones.
  if (!u || u.status !== "active") throw notFound("User");
  const blockedByThem = !!(await one(ctx.db, `SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`, u.id, viewerId));
  if (blockedByThem) throw notFound("User");
  const p = await one<{ bio: string; location: string; website: string; pronouns: string; banner: string }>(
    ctx.db,
    `SELECT bio, location, website, pronouns, banner FROM profiles WHERE user_id = ?`,
    u.id,
  );
  const [counts, rel] = await Promise.all([
    one<{ followers: number; following: number; posts: number }>(
      ctx.db,
      `SELECT (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers,
              (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following,
              (SELECT COUNT(*) FROM posts WHERE author_id = ? AND status = 'visible' AND repost_of IS NULL) AS posts`,
      u.id,
      u.id,
      u.id,
    ),
    one<{ following: number; follows_you: number; blocked: number }>(
      ctx.db,
      `SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS following,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS follows_you,
              EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?) AS blocked`,
      viewerId,
      u.id,
      u.id,
      viewerId,
      viewerId,
      u.id,
    ),
  ]);
  const canView = await canViewProfileContent(ctx, viewerId, u.id);
  return {
    ...toSummary(u),
    bio: p?.bio ?? "",
    location: canView ? (p?.location ?? "") : "",
    website: canView ? (p?.website ?? "") : "",
    pronouns: p?.pronouns ?? "",
    banner: p?.banner ?? "aurora",
    createdAt: u.created_at,
    canViewContent: canView,
    counts: counts ?? { followers: 0, following: 0, posts: 0 },
    relationship: { isSelf: viewerId === u.id, following: !!rel?.following, followsYou: !!rel?.follows_you, blocked: !!rel?.blocked },
  };
}

export async function follow(ctx: Ctx, viewer: { id: string; displayName: string; username: string }, username: string): Promise<void> {
  const u = await findByUsername(ctx, username);
  if (!u || u.status !== "active" || u.id === viewer.id) throw notFound("User");
  if (await isBlockedEither(ctx, viewer.id, u.id)) throw notFound("User");
  const n = await run(ctx.db, `INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)`, viewer.id, u.id, ctx.now());
  if (n) await notify(ctx, u.id, { kind: "follow", actorId: viewer.id, title: `${viewer.displayName} followed you`, link: `/u/${viewer.username}` });
}

export async function unfollow(ctx: Ctx, viewerId: string, username: string): Promise<void> {
  const u = await findByUsername(ctx, username);
  if (!u) throw notFound("User");
  await run(ctx.db, `DELETE FROM follows WHERE follower_id = ? AND followee_id = ?`, viewerId, u.id);
}

/** Removes a follower (the owner of a followers-only profile can do this). */
export async function removeFollower(ctx: Ctx, ownerId: string, username: string): Promise<void> {
  const u = await findByUsername(ctx, username);
  if (!u) throw notFound("User");
  await run(ctx.db, `DELETE FROM follows WHERE follower_id = ? AND followee_id = ?`, u.id, ownerId);
}

export async function block(ctx: Ctx, viewerId: string, username: string): Promise<void> {
  const u = await findByUsername(ctx, username);
  if (!u || u.id === viewerId) throw badRequest("You can't block that account.");
  await ctx.db.batch([
    stmt(ctx.db, `INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`, viewerId, u.id, ctx.now()),
    stmt(ctx.db, `DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)`, viewerId, u.id, u.id, viewerId),
  ]);
}

export async function unblock(ctx: Ctx, viewerId: string, username: string): Promise<void> {
  const u = await findByUsername(ctx, username);
  if (!u) throw notFound("User");
  await run(ctx.db, `DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`, viewerId, u.id);
}

export async function listBlocked(ctx: Ctx, viewerId: string): Promise<UserSummary[]> {
  const rows = await all<UserRow>(
    ctx.db,
    `SELECT ${USER_COLS} FROM user_blocks b JOIN users u ON u.id = b.blocked_id LEFT JOIN profiles pr ON pr.user_id = u.id WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    viewerId,
  );
  return rows.map(toSummary);
}

export async function listFollows(ctx: Ctx, viewerId: string, username: string, which: "followers" | "following"): Promise<UserSummary[]> {
  const u = await findByUsername(ctx, username);
  if (!u || u.status !== "active") throw notFound("User");
  if (!(await canViewProfileContent(ctx, viewerId, u.id))) return [];
  const [match, other] = which === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
  const rows = await all<UserRow>(
    ctx.db,
    `SELECT ${USER_COLS} FROM follows f JOIN users u ON u.id = f.${other} LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE f.${match} = ? AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))
      ORDER BY f.created_at DESC LIMIT 200`,
    u.id,
    viewerId,
    viewerId,
  );
  return rows.map(toSummary);
}

/** Accounts to follow: active, public, not already followed, ranked by followers. */
export async function suggestions(ctx: Ctx, viewerId: string, limit = 5): Promise<UserSummary[]> {
  const rows = await all<UserRow>(
    ctx.db,
    `SELECT ${USER_COLS} FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE u.id <> ? AND u.status = 'active' AND COALESCE(pr.profile_visibility, 'public') = 'public'
        AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))
      ORDER BY (SELECT COUNT(*) FROM follows f2 WHERE f2.followee_id = u.id) DESC, u.created_at DESC LIMIT ?`,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    limit,
  );
  return rows.map(toSummary);
}
