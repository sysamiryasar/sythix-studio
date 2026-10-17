import type { Ctx } from "../env";
import type { NotificationView } from "@shared/types";
import { all, one, run } from "../lib/db";
import { newId } from "../lib/ids";
import { summariesById } from "./users";
import { publish } from "../realtime/publish";

export type NotificationKind = "follow" | "reaction" | "comment" | "reply" | "mention" | "repost" | "message" | "community" | "moderation" | "system";

/**
 * Stores a notification and pushes the new unread count to the user's realtime
 * room. Never notifies a user about an actor they've blocked (or who blocked them).
 */
export async function notify(ctx: Ctx, userId: string, n: { kind: NotificationKind; actorId?: string | null; title: string; body?: string; link?: string }): Promise<void> {
  if (n.actorId) {
    if (n.actorId === userId) return;
    const blocked = await one(ctx.db, `SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`, userId, n.actorId, n.actorId, userId);
    if (blocked) return;
  }
  await run(
    ctx.db,
    `INSERT INTO notifications (id, user_id, actor_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("ntf"),
    userId,
    n.actorId ?? null,
    n.kind,
    n.title.slice(0, 200),
    n.body?.slice(0, 280) ?? null,
    n.link ?? null,
    ctx.now(),
  );
  ctx.waitUntil(unreadCount(ctx, userId).then((unread) => publish(ctx, `user:${userId}`, { type: "notification", unread })));
}

export async function unreadCount(ctx: Ctx, userId: string): Promise<number> {
  return (await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`, userId))?.n ?? 0;
}

export async function listNotifications(ctx: Ctx, userId: string, limit = 50): Promise<NotificationView[]> {
  const rows = await all<{ id: string; kind: string; title: string; body: string | null; link: string | null; actor_id: string | null; read_at: number | null; created_at: number }>(
    ctx.db,
    `SELECT id, kind, title, body, link, actor_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    userId,
    limit,
  );
  const actors = await summariesById(ctx, rows.flatMap((r) => (r.actor_id ? [r.actor_id] : [])));
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, actor: r.actor_id ? (actors.get(r.actor_id) ?? null) : null, readAt: r.read_at, createdAt: r.created_at }));
}

export async function markRead(ctx: Ctx, userId: string, ids: string[] | "all"): Promise<void> {
  if (ids === "all") {
    await run(ctx.db, `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`, ctx.now(), userId);
  } else {
    for (const id of ids.slice(0, 100)) await run(ctx.db, `UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`, ctx.now(), id, userId);
  }
}
