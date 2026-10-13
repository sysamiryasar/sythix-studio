import type { AppContext } from "../context";
import { newId } from "../ids";
import { one } from "../db/sql";

/**
 * Statements that provision a new account: personal workspace, owner membership,
 * preferences, NexusID profile and starter cosmetics. Returned as a batch so
 * account creation is atomic.
 */
export async function provisioningStatements(
  ctx: AppContext,
  user: { id: string; username: string },
): Promise<D1PreparedStatement[]> {
  const now = ctx.now();
  const workspaceId = newId("wsp");
  let slug = user.username.toLowerCase().replace(/_/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  if (slug.length < 2) slug = `${slug}-ws`;
  if (await one(ctx.db, `SELECT 1 FROM workspaces WHERE slug = ?`, slug)) slug = `${slug}-${workspaceId.slice(-6)}`;

  return [
    ctx.db
      .prepare(`INSERT INTO workspaces (id, slug, name, owner_id, is_personal, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .bind(workspaceId, slug, `${user.username}'s workspace`, user.id, now, now),
    ctx.db
      .prepare(`INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, 'workspace_owner', ?)`)
      .bind(workspaceId, user.id, now),
    ctx.db
      .prepare(`INSERT INTO user_preferences (user_id, default_workspace_id, updated_at) VALUES (?, ?, ?)`)
      .bind(user.id, workspaceId, now),
    ctx.db.prepare(`INSERT INTO player_profiles (user_id, created_at, updated_at) VALUES (?, ?, ?)`).bind(user.id, now, now),
    ctx.db
      .prepare(
        `INSERT INTO cosmetic_inventory (user_id, cosmetic_id, source, acquired_at)
         SELECT ?, id, 'starter', ? FROM cosmetic_definitions WHERE unlock = 'starter'`,
      )
      .bind(user.id, now),
  ];
}
