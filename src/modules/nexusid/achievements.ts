import type { AppContext } from "@/lib/context";
import { all, one } from "@/lib/db/sql";
import { notify } from "@/lib/notifications";

export type AchievementId =
  | "welcome"
  | "profile_complete"
  | "first_friend"
  | "team_founder"
  | "first_project"
  | "first_export"
  | "first_server"
  | "first_deploy";

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  awarded_at: number | null;
  showcased: number;
}

/**
 * Awards an achievement once (idempotent) and grants any cosmetics it unlocks.
 * Achievements are only ever awarded from real platform events.
 */
export async function awardAchievement(ctx: AppContext, userId: string, id: AchievementId): Promise<boolean> {
  const res = await ctx.db
    .prepare(`INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, awarded_at) VALUES (?, ?, ?)`)
    .bind(userId, id, ctx.now())
    .run();
  if (!res.meta?.changes) return false;

  await ctx.db
    .prepare(
      `INSERT OR IGNORE INTO cosmetic_inventory (user_id, cosmetic_id, source, acquired_at)
       SELECT ?, id, 'achievement:' || ?, ? FROM cosmetic_definitions WHERE unlock = 'achievement' AND unlock_achievement_id = ?`,
    )
    .bind(userId, id, ctx.now(), id)
    .run();

  const def = await one<{ name: string }>(ctx.db, `SELECT name FROM achievements WHERE id = ?`, id);
  await notify(ctx, userId, {
    kind: "achievement.awarded",
    title: `Achievement unlocked: ${def?.name ?? id}`,
    link: "/nexus/achievements",
  });
  return true;
}

export async function listAchievements(ctx: AppContext, userId: string): Promise<AchievementView[]> {
  return all<AchievementView>(
    ctx.db,
    `SELECT a.id, a.name, a.description, a.category, a.icon, a.points, ua.awarded_at, COALESCE(ua.showcased, 0) AS showcased
       FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      ORDER BY a.category, a.points`,
    userId,
  );
}

export async function setShowcase(ctx: AppContext, userId: string, ids: string[]): Promise<void> {
  await ctx.db.batch([
    ctx.db.prepare(`UPDATE user_achievements SET showcased = 0 WHERE user_id = ?`).bind(userId),
    ...ids.slice(0, 6).map((id) => ctx.db.prepare(`UPDATE user_achievements SET showcased = 1 WHERE user_id = ? AND achievement_id = ?`).bind(userId, id)),
  ]);
}
