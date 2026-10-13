import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { one, parseJson, run } from "@/lib/db/sql";
import { recordAudit } from "@/lib/audit";
import { requireServer } from "@/lib/authz/check";
import { serverCan, type ServerPermission } from "@/lib/authz/roles";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { CAPABILITY_FOR_KIND, payloadSchemas, type CommandKind } from "./protocol";
import { COMMAND_TTL_MS } from "./constants";
import { connectionState } from "./servers";

const PERMISSION_FOR_KIND: Record<CommandKind, ServerPermission> = {
  "console.command": "server.console.execute",
  "players.kick": "server.players.moderate",
  "players.ban": "server.players.moderate",
  "players.unban": "server.players.moderate",
  "plugins.scan": "server.plugins.read",
  "config.read": "server.plugins.read",
  "config.write": "server.plugins.manage",
  "config.backups": "server.plugins.read",
  "config.restore": "server.plugins.manage",
  "datapack.deploy": "server.deploy",
};

/**
 * Queues a typed operation for the server's agent after checking permission,
 * payload validity, live connection and advertised capability. Never pretends
 * success: if the agent is offline the request is rejected outright.
 */
export async function queueCommand(ctx: AppContext, user: SessionUser, serverId: string, kind: CommandKind, rawPayload: unknown): Promise<{ id: string }> {
  await requireServer(ctx, user, serverId, PERMISSION_FOR_KIND[kind]);
  await enforceRateLimit(ctx, RATE_LIMITS.serverCommand, `${user.id}:${serverId}`);
  const payload = payloadSchemas[kind].parse(rawPayload);
  const conn = await one<{ last_heartbeat_at: number | null; capabilities: string }>(ctx.db, `SELECT last_heartbeat_at, capabilities FROM server_connections WHERE server_id = ?`, serverId);
  if (connectionState(conn?.last_heartbeat_at ?? null, ctx.now()) !== "online") {
    throw new AppError("unavailable", "The server's agent is disconnected. Nothing was sent.");
  }
  const caps = parseJson<string[]>(conn?.capabilities, []);
  if (!caps.includes(CAPABILITY_FOR_KIND[kind])) throw new AppError("unavailable", `The connected agent does not support "${kind}" (capability "${CAPABILITY_FOR_KIND[kind]}" disabled in its config).`);

  const id = newId("cmd");
  await run(
    ctx.db,
    `INSERT INTO server_commands (id, server_id, kind, payload, status, requested_by, created_at, expires_at) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`,
    id, serverId, kind, JSON.stringify(payload), user.id, ctx.now(), ctx.now() + COMMAND_TTL_MS,
  );
  // Never put file contents in the audit log.
  const auditPayload = kind === "config.write" ? { plugin: (payload as { plugin: string }).plugin, file: (payload as { file: string }).file } : payload;
  await recordAudit(ctx, { actorId: user.id, action: `server.command.${kind}`, targetType: "command", targetId: id, serverId, metadata: auditPayload as Record<string, unknown> });
  return { id };
}

export interface CommandView {
  id: string;
  kind: string;
  status: string;
  created_at: number;
  completed_at: number | null;
  result: unknown;
}

/** Command status/result. Results are visible to the requester, or to anyone with server.audit.read. */
export async function getCommand(ctx: AppContext, user: SessionUser, serverId: string, commandId: string): Promise<CommandView> {
  const role = await requireServer(ctx, user, serverId, "server.view");
  const c = await one<{ id: string; kind: string; status: string; created_at: number; completed_at: number | null; result: string | null; requested_by: string }>(
    ctx.db,
    `SELECT id, kind, status, created_at, completed_at, result, requested_by FROM server_commands WHERE id = ? AND server_id = ?`,
    commandId,
    serverId,
  );
  if (!c || (c.requested_by !== user.id && !serverCan(role, "server.audit.read"))) throw notFound("Command");
  return { id: c.id, kind: c.kind, status: c.status, created_at: c.created_at, completed_at: c.completed_at, result: parseJson(c.result, null) };
}
