import type { AppContext } from "@/lib/context";
import { AppError } from "@/lib/errors";
import { all, one, parseJson, run } from "@/lib/db/sql";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { awardAchievement } from "@/modules/nexusid/achievements";
import type { AgentPrincipal } from "./credentials";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS } from "./constants";
import { COMMAND_KINDS, type Heartbeat } from "./protocol";

async function serverAdmins(ctx: AppContext, serverId: string): Promise<string[]> {
  return (await all<{ user_id: string }>(ctx.db, `SELECT user_id FROM server_memberships WHERE server_id = ? AND role = 'server_admin'`, serverId)).map((r) => r.user_id);
}

async function applyResult(ctx: AppContext, p: AgentPrincipal, r: Heartbeat["results"][number]): Promise<void> {
  const cmd = await one<{ id: string; kind: string; payload: string; requested_by: string | null }>(
    ctx.db,
    `SELECT id, kind, payload, requested_by FROM server_commands WHERE id = ? AND server_id = ? AND status = 'dispatched'`,
    r.commandId,
    p.serverId,
  );
  if (!cmd) return; // Unknown, foreign or already-completed command: ignored.
  const result = JSON.stringify(r.ok ? { ok: true, data: r.result ?? null } : { ok: false, error: r.error ?? "Unknown agent error" }).slice(0, 300_000);
  await run(ctx.db, `UPDATE server_commands SET status = ?, completed_at = ?, result = ? WHERE id = ?`, r.ok ? "succeeded" : "failed", ctx.now(), result, cmd.id);
  await recordAudit(ctx, { actorType: "agent", actorId: p.credentialId, action: `agent.result.${cmd.kind}`, targetType: "command", targetId: cmd.id, serverId: p.serverId, metadata: { ok: r.ok, error: r.error } });

  if (cmd.kind === "plugins.scan" && r.ok) {
    const plugins = ((r.result as { plugins?: unknown[] })?.plugins ?? []) as { name: string; version: string; file: string; apiVersion?: string; description?: string; authors?: string[] }[];
    await ctx.db.batch([
      ctx.db.prepare(`DELETE FROM server_plugins WHERE server_id = ?`).bind(p.serverId),
      ...plugins.slice(0, 500).map((pl) =>
        ctx.db
          .prepare(`INSERT OR REPLACE INTO server_plugins (server_id, name, version, file_name, api_version, description, authors, reported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(p.serverId, String(pl.name).slice(0, 64), String(pl.version ?? "?").slice(0, 64), String(pl.file).slice(0, 128), pl.apiVersion ?? null, pl.description?.slice(0, 300) ?? null, pl.authors ? pl.authors.join(", ").slice(0, 200) : null, ctx.now()),
      ),
    ]);
  }

  if (cmd.kind === "datapack.deploy") {
    const dep = await one<{ id: string; project_id: string; requested_by: string; name: string }>(
      ctx.db,
      `SELECT d.id, d.project_id, d.requested_by, p.name FROM deployment_jobs d JOIN projects p ON p.id = d.project_id WHERE d.command_id = ?`,
      cmd.id,
    );
    if (dep) {
      await run(ctx.db, `UPDATE deployment_jobs SET status = ?, result = ?, updated_at = ? WHERE id = ?`, r.ok ? "succeeded" : "failed", result, ctx.now(), dep.id);
      const server = await one<{ name: string }>(ctx.db, `SELECT name FROM servers WHERE id = ?`, p.serverId);
      await notify(ctx, dep.requested_by, {
        kind: "deployment.result",
        title: r.ok ? `${dep.name} deployed to ${server?.name}` : `Deployment of ${dep.name} to ${server?.name} failed`,
        body: r.ok ? undefined : r.error,
        link: `/servers/${p.serverId}/deployments`,
      });
      await recordAudit(ctx, { actorType: "agent", actorId: p.credentialId, action: r.ok ? "deployment.succeeded" : "deployment.failed", targetType: "deployment", targetId: dep.id, serverId: p.serverId });
      if (r.ok) await awardAchievement(ctx, dep.requested_by, "first_deploy");
    }
  }
}

export interface HeartbeatResponse {
  serverId: string;
  heartbeatIntervalMs: number;
  commands: { id: string; kind: string; payload: unknown }[];
}

/** Processes one agent heartbeat: connection state, telemetry, console, players, bans, results, and command dispatch. */
export async function processHeartbeat(ctx: AppContext, p: AgentPrincipal, hb: Heartbeat): Promise<HeartbeatResponse> {
  const now = ctx.now();
  const prev = await one<{ last_heartbeat_at: number | null; connected_since: number | null; first_connected_at: number | null; disconnect_notified_at: number | null }>(
    ctx.db,
    `SELECT last_heartbeat_at, connected_since, first_connected_at, disconnect_notified_at FROM server_connections WHERE server_id = ?`,
    p.serverId,
  );
  const reconnecting = !prev?.last_heartbeat_at || now - prev.last_heartbeat_at > HEARTBEAT_STALE_MS;
  const capabilities = hb.capabilities.filter((c) => /^[a-z.]+$/.test(c));
  await run(
    ctx.db,
    `INSERT INTO server_connections (server_id, credential_id, agent_version, capabilities, reported_software, reported_version, first_connected_at, last_heartbeat_at, connected_since, last_status, simulated, disconnect_notified_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(server_id) DO UPDATE SET credential_id = excluded.credential_id, agent_version = excluded.agent_version, capabilities = excluded.capabilities,
       reported_software = excluded.reported_software, reported_version = excluded.reported_version,
       first_connected_at = COALESCE(server_connections.first_connected_at, excluded.first_connected_at),
       last_heartbeat_at = excluded.last_heartbeat_at, connected_since = excluded.connected_since, last_status = excluded.last_status,
       simulated = excluded.simulated, disconnect_notified_at = NULL, updated_at = excluded.updated_at`,
    p.serverId, p.credentialId, hb.agentVersion, JSON.stringify(capabilities), hb.server.software, hb.server.version, now, now,
    reconnecting ? now : (prev?.connected_since ?? now), hb.server.reachable ? "reachable" : "unreachable", hb.mode === "simulated" ? 1 : 0, now,
  );

  if (reconnecting) {
    const server = await one<{ name: string }>(ctx.db, `SELECT name FROM servers WHERE id = ?`, p.serverId);
    const admins = await serverAdmins(ctx, p.serverId);
    if (!prev?.first_connected_at) {
      await recordAudit(ctx, { actorType: "agent", actorId: p.credentialId, action: "agent.first_connected", targetType: "server", targetId: p.serverId, serverId: p.serverId, metadata: { mode: hb.mode } });
      for (const a of admins) if (hb.mode === "live") await awardAchievement(ctx, a, "first_server");
    }
    if (prev?.disconnect_notified_at) {
      for (const a of admins) await notify(ctx, a, { kind: "server.connected", title: `${server?.name} reconnected`, link: `/servers/${p.serverId}` });
    }
  }

  const bucket = now - (now % 60_000);
  await run(
    ctx.db,
    `INSERT OR REPLACE INTO server_telemetry (server_id, bucket_start, players_online, players_max, tps_1m, tps_5m, tps_15m, host_mem_used, host_mem_total, host_load_1m, host_cpu_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.serverId, bucket, hb.server.playersOnline, hb.server.playersMax, hb.server.tps?.[0] ?? null, hb.server.tps?.[1] ?? null, hb.server.tps?.[2] ?? null,
    hb.host?.memUsed ?? null, hb.host?.memTotal ?? null, hb.host?.load1 ?? null, hb.host?.cpus ?? null,
  );

  const batch: D1PreparedStatement[] = [];
  for (const line of hb.console) {
    batch.push(ctx.db.prepare(`INSERT INTO server_console_lines (server_id, ts, level, line) VALUES (?, ?, ?, ?)`).bind(p.serverId, line.ts, line.level.slice(0, 10), line.line.slice(0, 1000)));
  }
  if (hb.server.players) {
    batch.push(ctx.db.prepare(`UPDATE server_players SET online = 0 WHERE server_id = ? AND online = 1`).bind(p.serverId));
    for (const pl of hb.server.players) {
      batch.push(
        ctx.db
          .prepare(
            `INSERT INTO server_players (server_id, uuid, name, online, first_seen_at, last_seen_at) VALUES (?, ?, ?, 1, ?, ?)
             ON CONFLICT(server_id, uuid) DO UPDATE SET name = excluded.name, online = 1, last_seen_at = excluded.last_seen_at`,
          )
          .bind(p.serverId, pl.uuid, pl.name, now, now),
      );
    }
  }
  if (hb.bans) {
    batch.push(ctx.db.prepare(`DELETE FROM server_bans WHERE server_id = ?`).bind(p.serverId));
    for (const b of hb.bans) {
      batch.push(ctx.db.prepare(`INSERT OR REPLACE INTO server_bans (server_id, uuid, name, reason, source, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(p.serverId, b.uuid, b.name, b.reason, b.source, b.created, b.expires));
    }
  }
  if (batch.length) await ctx.db.batch(batch);

  for (const r of hb.results) {
    try {
      await applyResult(ctx, p, r);
    } catch (err) {
      log("error", "agent.result_failed", { serverId: p.serverId, commandId: r.commandId, err });
    }
  }

  // Expire stale queued commands, then hand out the next batch.
  await run(ctx.db, `UPDATE server_commands SET status = 'expired', completed_at = ? WHERE server_id = ? AND status IN ('queued', 'dispatched') AND expires_at < ?`, now, p.serverId, now);
  const queued = await all<{ id: string; kind: string; payload: string }>(
    ctx.db,
    `SELECT id, kind, payload FROM server_commands WHERE server_id = ? AND status = 'queued' ORDER BY created_at LIMIT 10`,
    p.serverId,
  );
  const commands = queued.filter((c) => (COMMAND_KINDS as readonly string[]).includes(c.kind));
  if (commands.length) {
    await ctx.db.batch(commands.map((c) => ctx.db.prepare(`UPDATE server_commands SET status = 'dispatched', dispatched_at = ? WHERE id = ? AND status = 'queued'`).bind(now, c.id)));
  }
  return { serverId: p.serverId, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, commands: commands.map((c) => ({ id: c.id, kind: c.kind, payload: parseJson(c.payload, {}) })) };
}

/** Streams a deployment artifact to the agent of the target server only, while the deployment is in flight. */
export async function deploymentArtifact(ctx: AppContext, p: AgentPrincipal, deploymentId: string): Promise<R2ObjectBody> {
  const dep = await one<{ r2_key: string | null }>(
    ctx.db,
    `SELECT e.r2_key FROM deployment_jobs d JOIN export_jobs e ON e.id = d.export_id WHERE d.id = ? AND d.server_id = ? AND d.status = 'dispatched'`,
    deploymentId,
    p.serverId,
  );
  if (!dep?.r2_key) throw new AppError("not_found", "No in-flight deployment for this agent.");
  const obj = await ctx.bucket.get(dep.r2_key);
  if (!obj) throw new AppError("not_found", "Artifact missing.");
  return obj;
}

