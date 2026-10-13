import { z } from "zod";
import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { all, one, parseJson, run } from "@/lib/db/sql";
import { recordAudit } from "@/lib/audit";
import { requireServer, requireVerified, requireWorkspace } from "@/lib/authz/check";
import type { ServerRole } from "@/lib/authz/roles";
import { HEARTBEAT_STALE_MS, SUPPORTED_SOFTWARE } from "./constants";

export const serverInput = z.object({
  name: z.string().trim().min(2).max(48),
  address: z
    .string()
    .trim()
    .max(253)
    .regex(/^$|^[A-Za-z0-9.-]+(:\d{1,5})?$/, "Use a hostname or IP, optionally with :port.")
    .default(""),
  software: z.enum(SUPPORTED_SOFTWARE),
  mcVersion: z.string().trim().regex(/^1\.\d{1,2}(\.\d{1,2})?$/, "Use a Minecraft version like 1.21.4."),
  environment: z.enum(["production", "staging", "development"]).default("production"),
  description: z.string().trim().max(500).default(""),
});

export type ConnectionState = "never_connected" | "online" | "offline";

export interface ServerSummary {
  id: string;
  workspace_id: string;
  name: string;
  address: string;
  software: string;
  mc_version: string;
  environment: string;
  description: string;
  created_at: number;
  role: ServerRole | null;
  connection: {
    state: ConnectionState;
    lastHeartbeatAt: number | null;
    connectedSince: number | null;
    agentVersion: string | null;
    capabilities: string[];
    reportedSoftware: string | null;
    reportedVersion: string | null;
    simulated: boolean;
    serverReachable: boolean | null;
  };
}

interface Row {
  id: string;
  workspace_id: string;
  name: string;
  address: string;
  software: string;
  mc_version: string;
  environment: string;
  description: string;
  created_at: number;
  role: ServerRole | null;
  last_heartbeat_at: number | null;
  connected_since: number | null;
  agent_version: string | null;
  capabilities: string | null;
  reported_software: string | null;
  reported_version: string | null;
  simulated: number | null;
  last_status: string | null;
}

const SELECT = `SELECT s.id, s.workspace_id, s.name, s.address, s.software, s.mc_version, s.environment, s.description, s.created_at,
  m.role, c.last_heartbeat_at, c.connected_since, c.agent_version, c.capabilities, c.reported_software, c.reported_version, c.simulated, c.last_status
  FROM servers s LEFT JOIN server_connections c ON c.server_id = s.id`;

export function connectionState(lastHeartbeatAt: number | null, now: number): ConnectionState {
  if (!lastHeartbeatAt) return "never_connected";
  return now - lastHeartbeatAt <= HEARTBEAT_STALE_MS ? "online" : "offline";
}

function toSummary(r: Row, now: number): ServerSummary {
  const state = connectionState(r.last_heartbeat_at, now);
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    name: r.name,
    address: r.address,
    software: r.software,
    mc_version: r.mc_version,
    environment: r.environment,
    description: r.description,
    created_at: r.created_at,
    role: r.role,
    connection: {
      state,
      lastHeartbeatAt: r.last_heartbeat_at,
      connectedSince: state === "online" ? r.connected_since : null,
      agentVersion: r.agent_version,
      capabilities: state === "online" ? parseJson<string[]>(r.capabilities, []) : [],
      reportedSoftware: r.reported_software,
      reportedVersion: r.reported_version,
      simulated: r.simulated === 1,
      serverReachable: state === "online" ? r.last_status === "reachable" : null,
    },
  };
}

/** Servers the user has a membership on (workspace roles alone grant nothing). */
export async function listMyServers(ctx: AppContext, user: SessionUser): Promise<ServerSummary[]> {
  const rows = await all<Row>(ctx.db, `${SELECT} JOIN server_memberships m ON m.server_id = s.id AND m.user_id = ? ORDER BY s.name`, user.id);
  return rows.map((r) => toSummary(r, ctx.now()));
}

/**
 * Workspace-level listing for owners/admins (server.list): names and connection
 * state only. It does not grant access to any server's console or players.
 */
export async function listWorkspaceServers(ctx: AppContext, user: SessionUser, workspaceId: string) {
  await requireWorkspace(ctx, user, workspaceId, "server.list");
  const rows = await all<Row>(ctx.db, `${SELECT} LEFT JOIN server_memberships m ON m.server_id = s.id AND m.user_id = ? WHERE s.workspace_id = ? ORDER BY s.name`, user.id, workspaceId);
  return rows.map((r) => toSummary(r, ctx.now()));
}

export async function getServer(ctx: AppContext, user: SessionUser, serverId: string): Promise<ServerSummary> {
  await requireServer(ctx, user, serverId, "server.view");
  const r = await one<Row>(ctx.db, `${SELECT} LEFT JOIN server_memberships m ON m.server_id = s.id AND m.user_id = ? WHERE s.id = ?`, user.id, serverId);
  if (!r) throw notFound("Server");
  return toSummary(r, ctx.now());
}

export async function registerServer(ctx: AppContext, user: SessionUser, workspaceId: string, input: z.infer<typeof serverInput>): Promise<{ id: string }> {
  requireVerified(user);
  await requireWorkspace(ctx, user, workspaceId, "server.register");
  const count = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM servers WHERE workspace_id = ?`, workspaceId);
  if ((count?.n ?? 0) >= 25) throw badRequest("Workspaces can register at most 25 servers.");
  const id = newId("srv");
  const now = ctx.now();
  await ctx.db.batch([
    ctx.db
      .prepare(`INSERT INTO servers (id, workspace_id, name, address, software, mc_version, environment, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, workspaceId, input.name, input.address, input.software, input.mcVersion, input.environment, input.description, user.id, now, now),
    ctx.db.prepare(`INSERT INTO server_memberships (server_id, user_id, role, granted_by, created_at) VALUES (?, ?, 'server_admin', ?, ?)`).bind(id, user.id, user.id, now),
    ctx.db.prepare(`INSERT INTO server_connections (server_id, updated_at) VALUES (?, ?)`).bind(id, now),
  ]);
  await recordAudit(ctx, { actorId: user.id, action: "server.registered", targetType: "server", targetId: id, serverId: id, workspaceId, metadata: { software: input.software, version: input.mcVersion } });
  return { id };
}

export async function updateServer(ctx: AppContext, user: SessionUser, serverId: string, input: Partial<z.infer<typeof serverInput>>) {
  await requireServer(ctx, user, serverId, "server.manage");
  const s = (await one<{ name: string; address: string; software: string; mc_version: string; environment: string; description: string }>(ctx.db, `SELECT * FROM servers WHERE id = ?`, serverId))!;
  await run(
    ctx.db,
    `UPDATE servers SET name = ?, address = ?, software = ?, mc_version = ?, environment = ?, description = ?, updated_at = ? WHERE id = ?`,
    input.name ?? s.name, input.address ?? s.address, input.software ?? s.software, input.mcVersion ?? s.mc_version, input.environment ?? s.environment, input.description ?? s.description, ctx.now(), serverId,
  );
  await recordAudit(ctx, { actorId: user.id, action: "server.updated", targetType: "server", targetId: serverId, serverId, metadata: input });
}

export async function deleteServer(ctx: AppContext, user: SessionUser, serverId: string) {
  await requireServer(ctx, user, serverId, "server.manage");
  const s = await one<{ workspace_id: string; name: string }>(ctx.db, `SELECT workspace_id, name FROM servers WHERE id = ?`, serverId);
  await run(ctx.db, `DELETE FROM servers WHERE id = ?`, serverId);
  await recordAudit(ctx, { actorId: user.id, action: "server.removed", targetType: "server", targetId: serverId, serverId, workspaceId: s?.workspace_id, metadata: { name: s?.name } });
}

// Membership ---------------------------------------------------------------------

export async function listServerMembers(ctx: AppContext, user: SessionUser, serverId: string) {
  await requireServer(ctx, user, serverId, "server.view");
  return all<{ user_id: string; username: string; display_name: string; role: ServerRole; created_at: number }>(
    ctx.db,
    `SELECT u.id AS user_id, u.username, u.display_name, m.role, m.created_at FROM server_memberships m JOIN users u ON u.id = m.user_id WHERE m.server_id = ? ORDER BY m.role, u.username`,
    serverId,
  );
}

/** Grants a server role to a member of the server's workspace. */
export async function setServerMember(ctx: AppContext, user: SessionUser, serverId: string, username: string, role: ServerRole) {
  await requireServer(ctx, user, serverId, "server.members.manage");
  const target = await one<{ id: string }>(
    ctx.db,
    `SELECT u.id FROM users u JOIN workspace_memberships wm ON wm.user_id = u.id JOIN servers s ON s.workspace_id = wm.workspace_id WHERE s.id = ? AND u.username = ?`,
    serverId,
    username.trim(),
  );
  if (!target) throw notFound("Workspace member");
  await run(
    ctx.db,
    `INSERT INTO server_memberships (server_id, user_id, role, granted_by, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(server_id, user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by`,
    serverId, target.id, role, user.id, ctx.now(),
  );
  await recordAudit(ctx, { actorId: user.id, action: "server.member_set", targetType: "user", targetId: target.id, serverId, metadata: { role } });
}

export async function removeServerMember(ctx: AppContext, user: SessionUser, serverId: string, memberId: string) {
  await requireServer(ctx, user, serverId, "server.members.manage");
  const admins = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM server_memberships WHERE server_id = ? AND role = 'server_admin' AND user_id <> ?`, serverId, memberId);
  const target = await one<{ role: string }>(ctx.db, `SELECT role FROM server_memberships WHERE server_id = ? AND user_id = ?`, serverId, memberId);
  if (!target) throw notFound("Member");
  if (target.role === "server_admin" && !admins?.n) throw conflict("A server must keep at least one administrator.");
  await run(ctx.db, `DELETE FROM server_memberships WHERE server_id = ? AND user_id = ?`, serverId, memberId);
  await recordAudit(ctx, { actorId: user.id, action: "server.member_removed", targetType: "user", targetId: memberId, serverId });
}
