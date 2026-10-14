import type { AppContext } from "./context";
import { newId } from "./ids";
import { all, one, run } from "./db/sql";

export type NotificationKind =
  | "server.disconnected"
  | "server.connected"
  | "deployment.result"
  | "export.failed"
  | "friend.request"
  | "friend.accepted"
  | "team.invite"
  | "project.changed"
  | "security.event"
  | "achievement.awarded"
  | "module.update";

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: number | null;
  created_at: number;
}

export async function notify(
  ctx: AppContext,
  userId: string,
  n: { kind: NotificationKind; title: string; body?: string; link?: string },
): Promise<void> {
  await run(
    ctx.db,
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId("ntf"),
    userId,
    n.kind,
    n.title,
    n.body ?? null,
    n.link ?? null,
    ctx.now(),
  );
}

export async function listNotifications(ctx: AppContext, userId: string, limit = 30): Promise<NotificationRow[]> {
  return all<NotificationRow>(
    ctx.db,
    `SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    userId,
    limit,
  );
}

export async function unreadCount(ctx: AppContext, userId: string): Promise<number> {
  const r = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`, userId);
  return r?.n ?? 0;
}

export async function markRead(ctx: AppContext, userId: string, ids: string[] | "all"): Promise<void> {
  if (ids === "all") {
    await run(ctx.db, `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`, ctx.now(), userId);
    return;
  }
  for (const id of ids.slice(0, 100)) {
    await run(ctx.db, `UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL`, ctx.now(), id, userId);
  }
}

/** Retention: read notifications older than 90 days are deleted. */
export async function pruneNotifications(ctx: AppContext): Promise<void> {
  await run(ctx.db, `DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?`, ctx.now() - 90 * 86_400_000);
}
