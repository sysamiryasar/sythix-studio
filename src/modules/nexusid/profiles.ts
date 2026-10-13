import { z } from "zod";
import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { all, one, run } from "@/lib/db/sql";
import { awardAchievement } from "./achievements";
import { areFriends, isBlockedEitherWay } from "./social";

export const BANNER_STYLES = ["obsidian", "nether", "end", "ocean", "deepslate", "amethyst"] as const;

export const profileInput = z
  .object({
    bio: z.string().trim().max(280),
    bannerStyle: z.enum(BANNER_STYLES),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #8b5cf6."),
    avatarSource: z.enum(["initials", "minecraft"]),
    visibility: z.enum(["public", "friends", "private"]),
    showStats: z.boolean(),
    showAchievements: z.boolean(),
    showServers: z.boolean(),
    showCreations: z.boolean(),
    allowFriendRequests: z.boolean(),
  })
  .partial();

export interface ProfileRow {
  user_id: string;
  bio: string;
  avatar_source: "initials" | "minecraft";
  banner_style: (typeof BANNER_STYLES)[number];
  accent_color: string;
  visibility: "public" | "friends" | "private";
  show_stats: number;
  show_achievements: number;
  show_servers: number;
  show_creations: number;
  allow_friend_requests: number;
}

export async function getProfile(ctx: AppContext, userId: string): Promise<ProfileRow> {
  const p = await one<ProfileRow>(ctx.db, `SELECT * FROM player_profiles WHERE user_id = ?`, userId);
  if (p) return p;
  await run(ctx.db, `INSERT OR IGNORE INTO player_profiles (user_id, created_at, updated_at) VALUES (?, ?, ?)`, userId, ctx.now(), ctx.now());
  return (await one<ProfileRow>(ctx.db, `SELECT * FROM player_profiles WHERE user_id = ?`, userId))!;
}

export async function updateProfile(ctx: AppContext, userId: string, patch: z.infer<typeof profileInput>): Promise<ProfileRow> {
  const cur = await getProfile(ctx, userId);
  const b = (v: boolean | undefined, fallback: number) => (v === undefined ? fallback : v ? 1 : 0);
  await run(
    ctx.db,
    `UPDATE player_profiles SET bio = ?, banner_style = ?, accent_color = ?, avatar_source = ?, visibility = ?, show_stats = ?, show_achievements = ?,
       show_servers = ?, show_creations = ?, allow_friend_requests = ?, updated_at = ? WHERE user_id = ?`,
    patch.bio ?? cur.bio,
    patch.bannerStyle ?? cur.banner_style,
    patch.accentColor ?? cur.accent_color,
    patch.avatarSource ?? cur.avatar_source,
    patch.visibility ?? cur.visibility,
    b(patch.showStats, cur.show_stats),
    b(patch.showAchievements, cur.show_achievements),
    b(patch.showServers, cur.show_servers),
    b(patch.showCreations, cur.show_creations),
    b(patch.allowFriendRequests, cur.allow_friend_requests),
    ctx.now(),
    userId,
  );
  const next = await getProfile(ctx, userId);
  if (next.bio.length >= 10 && next.banner_style !== "obsidian") await awardAchievement(ctx, userId, "profile_complete");
  return next;
}

export interface PublicProfile {
  state: "visible" | "private" | "friends_only";
  user: { id: string; username: string; display_name: string; created_at: number };
  isSelf: boolean;
  relationship: "self" | "friends" | "pending_outgoing" | "pending_incoming" | "none";
  profile?: ProfileRow;
  minecraft?: { name: string; uuid: string } | null;
  stats?: { achievements: number; points: number; friends: number; publicCreations: number; teams: number };
  achievements?: { id: string; name: string; icon: string; description: string; awarded_at: number }[];
  creations?: { id: string; name: string; description: string; target_version: string; workspace_slug: string }[];
  servers?: { name: string; software: string; mc_version: string }[];
  loadout?: { category: string; name: string; rarity: string; preview_style: string; is_placeholder: number }[];
  teams?: { slug: string; name: string }[];
}

/**
 * Public profile with server-side privacy enforcement. Blocked users (either
 * direction) get null, which callers render as not found.
 */
export async function getPublicProfile(ctx: AppContext, viewer: SessionUser | null, username: string): Promise<PublicProfile | null> {
  const user = await one<{ id: string; username: string; display_name: string; created_at: number }>(
    ctx.db,
    `SELECT id, username, display_name, created_at FROM users WHERE username = ? AND status = 'active' AND email_verified_at IS NOT NULL`,
    username,
  );
  if (!user) return null;
  const isSelf = viewer?.id === user.id;
  if (viewer && !isSelf && (await isBlockedEitherWay(ctx, viewer.id, user.id))) return null;

  const profile = await getProfile(ctx, user.id);
  let relationship: PublicProfile["relationship"] = isSelf ? "self" : "none";
  if (viewer && !isSelf) {
    if (await areFriends(ctx, viewer.id, user.id)) relationship = "friends";
    else {
      const pending = await one<{ requester_id: string }>(
        ctx.db,
        `SELECT requester_id FROM friendships WHERE status = 'pending' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
        viewer.id,
        user.id,
        user.id,
        viewer.id,
      );
      if (pending) relationship = pending.requester_id === viewer.id ? "pending_outgoing" : "pending_incoming";
    }
  }

  const base = { user, isSelf, relationship };
  if (!isSelf && profile.visibility === "private") return { ...base, state: "private" };
  if (!isSelf && profile.visibility === "friends" && relationship !== "friends") return { ...base, state: "friends_only" };

  const minecraft = await one<{ name: string; uuid: string }>(
    ctx.db,
    `SELECT provider_name AS name, provider_subject AS uuid FROM verified_identities WHERE user_id = ? AND provider = 'minecraft_java'`,
    user.id,
  );
  const result: PublicProfile = { ...base, state: "visible", profile, minecraft };

  result.loadout = await all(
    ctx.db,
    `SELECT l.category, d.name, d.rarity, d.preview_style, d.is_placeholder FROM cosmetic_loadout l JOIN cosmetic_definitions d ON d.id = l.cosmetic_id WHERE l.user_id = ?`,
    user.id,
  );
  result.teams = await all(
    ctx.db,
    `SELECT t.slug, t.name FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? AND m.status = 'active' AND (t.visibility = 'public' OR ?) ORDER BY t.name`,
    user.id,
    isSelf ? 1 : 0,
  );

  if (isSelf || profile.show_stats) {
    const s = await one<{ achievements: number; points: number; friends: number; publicCreations: number; teams: number }>(
      ctx.db,
      `SELECT
         (SELECT COUNT(*) FROM user_achievements WHERE user_id = ?1) AS achievements,
         (SELECT COALESCE(SUM(a.points), 0) FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ?1) AS points,
         (SELECT COUNT(*) FROM friendships WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)) AS friends,
         (SELECT COUNT(*) FROM projects WHERE created_by = ?1 AND visibility = 'public' AND archived_at IS NULL) AS publicCreations,
         (SELECT COUNT(*) FROM team_members WHERE user_id = ?1 AND status = 'active') AS teams`,
      user.id,
    );
    result.stats = s ?? undefined;
  }
  if (isSelf || profile.show_achievements) {
    const showcased = await all<{ id: string; name: string; icon: string; description: string; awarded_at: number }>(
      ctx.db,
      `SELECT a.id, a.name, a.icon, a.description, ua.awarded_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.user_id = ? ORDER BY ua.showcased DESC, ua.awarded_at DESC LIMIT 6`,
      user.id,
    );
    result.achievements = showcased;
  }
  if (isSelf || profile.show_creations) {
    result.creations = await all(
      ctx.db,
      `SELECT p.id, p.name, p.description, p.target_version, w.slug AS workspace_slug FROM projects p JOIN workspaces w ON w.id = p.workspace_id
        WHERE p.created_by = ? AND p.visibility = 'public' AND p.archived_at IS NULL
        ORDER BY (SELECT 1 FROM favorite_creations f WHERE f.user_id = p.created_by AND f.project_id = p.id) DESC, p.updated_at DESC LIMIT 6`,
      user.id,
    );
  }
  if (isSelf || profile.show_servers) {
    result.servers = await all(
      ctx.db,
      `SELECT s.name, s.software, s.mc_version FROM server_memberships m JOIN servers s ON s.id = m.server_id WHERE m.user_id = ? AND m.role = 'server_admin' ORDER BY s.name LIMIT 10`,
      user.id,
    );
  }
  return result;
}
