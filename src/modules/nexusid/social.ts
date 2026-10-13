import { z } from "zod";
import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { all, one, run } from "@/lib/db/sql";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireVerified } from "@/lib/authz/check";
import { awardAchievement } from "./achievements";

export async function findUserByUsername(ctx: AppContext, username: string): Promise<{ id: string; username: string; display_name: string } | null> {
  return one(ctx.db, `SELECT id, username, display_name FROM users WHERE username = ? AND status = 'active'`, username.trim());
}

/** True when either user has blocked the other. */
export async function isBlockedEitherWay(ctx: AppContext, a: string, b: string): Promise<boolean> {
  return !!(await one(ctx.db, `SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`, a, b, b, a));
}

export async function areFriends(ctx: AppContext, a: string, b: string): Promise<boolean> {
  return !!(await one(
    ctx.db,
    `SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
    a,
    b,
    b,
    a,
  ));
}

// Friends -----------------------------------------------------------------------

export async function sendFriendRequest(ctx: AppContext, user: SessionUser, username: string): Promise<{ status: "pending" | "accepted" }> {
  requireVerified(user);
  const target = await findUserByUsername(ctx, username);
  // Blocked and request-closed users are indistinguishable from missing users.
  if (!target || target.id === user.id) throw notFound("Player");
  if (await isBlockedEitherWay(ctx, user.id, target.id)) throw notFound("Player");
  const prefs = await one<{ allow_friend_requests: number }>(ctx.db, `SELECT allow_friend_requests FROM player_profiles WHERE user_id = ?`, target.id);
  if (prefs && !prefs.allow_friend_requests) throw badRequest(`${target.username} is not accepting friend requests.`);

  const existing = await one<{ id: string; requester_id: string; status: string }>(
    ctx.db,
    `SELECT id, requester_id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    user.id,
    target.id,
    target.id,
    user.id,
  );
  if (existing?.status === "accepted") throw conflict(`You're already friends with ${target.username}.`);
  if (existing && existing.requester_id === user.id) throw conflict("Friend request already sent.");
  if (existing) {
    // They already asked us: sending back accepts.
    await respondToFriendRequest(ctx, user, existing.id, "accept");
    return { status: "accepted" };
  }
  await run(
    ctx.db,
    `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
    newId("frd"),
    user.id,
    target.id,
    ctx.now(),
  );
  await notify(ctx, target.id, { kind: "friend.request", title: `${user.displayName} sent you a friend request`, link: "/nexus/friends" });
  return { status: "pending" };
}

export async function respondToFriendRequest(ctx: AppContext, user: SessionUser, friendshipId: string, action: "accept" | "decline"): Promise<void> {
  const f = await one<{ id: string; requester_id: string }>(
    ctx.db,
    `SELECT id, requester_id FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
    friendshipId,
    user.id,
  );
  if (!f) throw notFound("Friend request");
  if (action === "decline") {
    await run(ctx.db, `DELETE FROM friendships WHERE id = ?`, f.id);
    return;
  }
  await run(ctx.db, `UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?`, ctx.now(), f.id);
  await notify(ctx, f.requester_id, { kind: "friend.accepted", title: `${user.displayName} accepted your friend request`, link: `/u/${user.username}` });
  await awardAchievement(ctx, user.id, "first_friend");
  await awardAchievement(ctx, f.requester_id, "first_friend");
}

/** Removes a friendship or cancels an outgoing request. Either party may do this. */
export async function removeFriendship(ctx: AppContext, user: SessionUser, friendshipId: string): Promise<void> {
  const n = await run(ctx.db, `DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)`, friendshipId, user.id, user.id);
  if (!n) throw notFound("Friendship");
}

export interface FriendView {
  friendship_id: string;
  user_id: string;
  username: string;
  display_name: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
  created_at: number;
}

export async function listFriends(ctx: AppContext, userId: string): Promise<FriendView[]> {
  return all<FriendView>(
    ctx.db,
    `SELECT f.id AS friendship_id, u.id AS user_id, u.username, u.display_name, f.status,
            CASE WHEN f.addressee_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction, f.created_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
      WHERE f.requester_id = ? OR f.addressee_id = ?
      ORDER BY f.status DESC, u.username`,
    userId,
    userId,
    userId,
    userId,
  );
}

// Blocks ------------------------------------------------------------------------

export async function blockUser(ctx: AppContext, user: SessionUser, username: string): Promise<void> {
  const target = await findUserByUsername(ctx, username);
  if (!target || target.id === user.id) throw notFound("Player");
  await ctx.db.batch([
    ctx.db.prepare(`INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`).bind(user.id, target.id, ctx.now()),
    ctx.db
      .prepare(`DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
      .bind(user.id, target.id, target.id, user.id),
    ctx.db.prepare(`DELETE FROM team_members WHERE user_id = ? AND status = 'invited' AND invited_by = ?`).bind(user.id, target.id),
  ]);
}

export async function unblockUser(ctx: AppContext, user: SessionUser, blockedId: string): Promise<void> {
  await run(ctx.db, `DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`, user.id, blockedId);
}

export async function listBlocks(ctx: AppContext, userId: string) {
  return all<{ user_id: string; username: string; created_at: number }>(
    ctx.db,
    `SELECT u.id AS user_id, u.username, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    userId,
  );
}

// Reports -----------------------------------------------------------------------

export const reportInput = z.object({
  targetType: z.enum(["user", "team", "project"]),
  targetId: z.string().max(64),
  reason: z.enum(["harassment", "spam", "impersonation", "inappropriate_content", "cheating", "other"]),
  details: z.string().trim().max(2000).default(""),
});

export async function createReport(ctx: AppContext, user: SessionUser, input: z.infer<typeof reportInput>): Promise<{ id: string }> {
  await enforceRateLimit(ctx, RATE_LIMITS.report, user.id);
  const table = { user: "users", team: "teams", project: "projects" }[input.targetType];
  if (!(await one(ctx.db, `SELECT 1 FROM ${table} WHERE id = ?`, input.targetId))) throw notFound("Report target");
  if (input.targetType === "user" && input.targetId === user.id) throw badRequest("You cannot report yourself.");
  const id = newId("rpt");
  await run(
    ctx.db,
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    user.id,
    input.targetType,
    input.targetId,
    input.reason,
    input.details,
    ctx.now(),
  );
  return { id };
}

export async function listReports(ctx: AppContext, status: "open" | "resolved" | "dismissed" = "open") {
  return all<{
    id: string;
    reporter: string;
    target_type: string;
    target_id: string;
    target_label: string | null;
    reason: string;
    details: string;
    status: string;
    created_at: number;
  }>(
    ctx.db,
    `SELECT r.id, u.username AS reporter, r.target_type, r.target_id,
            COALESCE(tu.username, tt.name, tp.name) AS target_label, r.reason, r.details, r.status, r.created_at
       FROM reports r JOIN users u ON u.id = r.reporter_id
       LEFT JOIN users tu ON r.target_type = 'user' AND tu.id = r.target_id
       LEFT JOIN teams tt ON r.target_type = 'team' AND tt.id = r.target_id
       LEFT JOIN projects tp ON r.target_type = 'project' AND tp.id = r.target_id
      WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`,
    status,
  );
}

export async function resolveReport(ctx: AppContext, actor: SessionUser, id: string, status: "resolved" | "dismissed"): Promise<void> {
  const n = await run(ctx.db, `UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'`, status, actor.id, ctx.now(), id);
  if (!n) throw notFound("Open report");
  await recordAudit(ctx, { actorId: actor.id, action: `report.${status}`, targetType: "report", targetId: id });
}
