import type { AppContext } from "../context";
import type { SessionUser } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { all, one } from "../db/sql";
import {
  platformCan,
  serverCan,
  workspaceCan,
  type PlatformPermission,
  type ServerPermission,
  type ServerRole,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./roles";

export function requirePlatform(user: SessionUser, p: PlatformPermission): void {
  if (!platformCan(user.platformRole, p)) throw forbidden();
}

export function requireVerified(user: SessionUser): void {
  if (!user.emailVerified) throw new AppError("forbidden", "Verify your email address to use this feature.");
}

export async function workspaceRole(ctx: AppContext, userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const r = await one<{ role: WorkspaceRole }>(
    ctx.db,
    `SELECT role FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?`,
    workspaceId,
    userId,
  );
  return r?.role ?? null;
}

/**
 * Throws not_found (not forbidden) when the user is not a member at all, so
 * workspace existence is not leaked to outsiders.
 */
export async function requireWorkspace(ctx: AppContext, user: SessionUser, workspaceId: string, p: WorkspacePermission): Promise<WorkspaceRole> {
  const role = await workspaceRole(ctx, user.id, workspaceId);
  if (!role) throw notFound("Workspace");
  if (!workspaceCan(role, p)) throw forbidden();
  return role;
}

export async function serverRole(ctx: AppContext, userId: string, serverId: string): Promise<ServerRole | null> {
  const r = await one<{ role: ServerRole }>(ctx.db, `SELECT role FROM server_memberships WHERE server_id = ? AND user_id = ?`, serverId, userId);
  return r?.role ?? null;
}

/**
 * Server permissions come only from a server membership. A workspace role —
 * even owner — never implies access to a server's console or players.
 */
export async function requireServer(ctx: AppContext, user: SessionUser, serverId: string, p: ServerPermission): Promise<ServerRole> {
  const role = await serverRole(ctx, user.id, serverId);
  if (!role) throw notFound("Server");
  if (!serverCan(role, p)) throw forbidden();
  return role;
}

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  is_personal: number;
  role: WorkspaceRole;
}

export async function listUserWorkspaces(ctx: AppContext, userId: string): Promise<WorkspaceSummary[]> {
  return all<WorkspaceSummary>(
    ctx.db,
    `SELECT w.id, w.slug, w.name, w.is_personal, m.role FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ? ORDER BY w.is_personal DESC, w.name`,
    userId,
  );
}
