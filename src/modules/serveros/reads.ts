import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { all } from "@/lib/db/sql";
import { requireServer } from "@/lib/authz/check";

export async function getTelemetry(ctx: AppContext, user: SessionUser, serverId: string, rangeMs: number) {
  await requireServer(ctx, user, serverId, "server.view");
  return all<{ bucket_start: number; players_online: number | null; players_max: number | null; tps_1m: number | null; host_mem_used: number | null; host_mem_total: number | null; host_load_1m: number | null; host_cpu_count: number | null }>(
    ctx.db,
    `SELECT bucket_start, players_online, players_max, tps_1m, host_mem_used, host_mem_total, host_load_1m, host_cpu_count FROM server_telemetry
      WHERE server_id = ? AND bucket_start >= ? ORDER BY bucket_start`,
    serverId,
    ctx.now() - rangeMs,
  );
}

export async function getConsole(ctx: AppContext, user: SessionUser, serverId: string, afterSeq: number, filter?: string) {
  await requireServer(ctx, user, serverId, "server.console.read");
  const level = filter && ["INFO", "WARN", "ERROR"].includes(filter) ? filter : null;
  const rows = await all<{ seq: number; ts: number; level: string; line: string }>(
    ctx.db,
    afterSeq > 0
      ? `SELECT seq, ts, level, line FROM server_console_lines WHERE server_id = ? AND seq > ? AND (? IS NULL OR level = ?) ORDER BY seq LIMIT 500`
      : `SELECT * FROM (SELECT seq, ts, level, line FROM server_console_lines WHERE server_id = ? AND seq > ? AND (? IS NULL OR level = ?) ORDER BY seq DESC LIMIT 300) ORDER BY seq`,
    serverId,
    afterSeq,
    level,
    level,
  );
  return rows;
}

export async function getPlayers(ctx: AppContext, user: SessionUser, serverId: string) {
  await requireServer(ctx, user, serverId, "server.view");
  const [players, bans, history] = await Promise.all([
    all<{ uuid: string; name: string; online: number; first_seen_at: number; last_seen_at: number }>(
      ctx.db,
      `SELECT uuid, name, online, first_seen_at, last_seen_at FROM server_players WHERE server_id = ? ORDER BY online DESC, last_seen_at DESC LIMIT 200`,
      serverId,
    ),
    all<{ uuid: string; name: string; reason: string | null; source: string | null; created: string | null; expires: string | null }>(ctx.db, `SELECT uuid, name, reason, source, created, expires FROM server_bans WHERE server_id = ? ORDER BY name`, serverId),
    all<{ id: string; player_name: string; action: string; reason: string; created_at: number; actor: string; status: string | null }>(
      ctx.db,
      `SELECT m.id, m.player_name, m.action, m.reason, m.created_at, u.username AS actor, c.status FROM moderation_actions m JOIN users u ON u.id = m.actor_id
        LEFT JOIN server_commands c ON c.id = m.command_id WHERE m.server_id = ? ORDER BY m.created_at DESC LIMIT 100`,
      serverId,
    ),
  ]);
  return { players, bans, history };
}

export async function getPlugins(ctx: AppContext, user: SessionUser, serverId: string) {
  await requireServer(ctx, user, serverId, "server.plugins.read");
  return all<{ name: string; version: string; file_name: string; api_version: string | null; description: string | null; authors: string | null; reported_at: number }>(
    ctx.db,
    `SELECT name, version, file_name, api_version, description, authors, reported_at FROM server_plugins WHERE server_id = ? ORDER BY name`,
    serverId,
  );
}

export async function getServerAudit(ctx: AppContext, user: SessionUser, serverId: string) {
  await requireServer(ctx, user, serverId, "server.audit.read");
  return all<{ id: string; actor_type: string; actor: string | null; action: string; metadata: string | null; created_at: number; ip: string | null }>(
    ctx.db,
    `SELECT a.id, a.actor_type, COALESCE(u.username, a.actor_id) AS actor, a.action, a.metadata, a.created_at, a.ip FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.server_id = ? ORDER BY a.created_at DESC LIMIT 200`,
    serverId,
  );
}
