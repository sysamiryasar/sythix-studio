import type { AppContext } from "@/lib/context";
import { all, run } from "@/lib/db/sql";
import { notify, pruneNotifications } from "@/lib/notifications";
import { pruneSessions } from "@/lib/auth/session";
import { pruneRateLimits } from "@/lib/security/rate-limit";
import { log } from "@/lib/logger";
import { CONSOLE_RETENTION_LINES, HEARTBEAT_STALE_MS, TELEMETRY_RETENTION_MS } from "./constants";

/** Detects newly-disconnected servers and notifies their administrators exactly once per outage. */
export async function sweepConnections(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const stale = await all<{ server_id: string; name: string }>(
    ctx.db,
    `SELECT c.server_id, s.name FROM server_connections c JOIN servers s ON s.id = c.server_id
      WHERE c.last_heartbeat_at IS NOT NULL AND c.last_heartbeat_at < ? AND c.disconnect_notified_at IS NULL`,
    now - HEARTBEAT_STALE_MS,
  );
  for (const s of stale) {
    await run(ctx.db, `UPDATE server_connections SET disconnect_notified_at = ? WHERE server_id = ?`, now, s.server_id);
    const admins = await all<{ user_id: string }>(ctx.db, `SELECT user_id FROM server_memberships WHERE server_id = ? AND role IN ('server_admin', 'server_moderator')`, s.server_id);
    for (const a of admins) await notify(ctx, a.user_id, { kind: "server.disconnected", title: `${s.name} disconnected`, body: "The agent stopped sending heartbeats.", link: `/servers/${s.server_id}` });
  }
  return stale.length;
}

/** Applies data-retention rules. Safe to run repeatedly. */
export async function pruneData(ctx: AppContext): Promise<void> {
  const now = ctx.now();
  await run(ctx.db, `DELETE FROM server_telemetry WHERE bucket_start < ?`, now - TELEMETRY_RETENTION_MS);
  await run(
    ctx.db,
    `DELETE FROM server_console_lines WHERE seq IN (
       SELECT seq FROM (SELECT seq, ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY seq DESC) AS rn FROM server_console_lines) WHERE rn > ?)`,
    CONSOLE_RETENTION_LINES,
  );
  // Plugin config contents are only kept for an hour after being read.
  await run(ctx.db, `UPDATE server_commands SET result = '{"ok":true,"data":{"pruned":true}}' WHERE kind = 'config.read' AND completed_at < ? AND result NOT LIKE '%"pruned":true%'`, now - 3_600_000);
  await run(ctx.db, `UPDATE server_commands SET payload = '{"pruned":true}' WHERE kind = 'config.write' AND created_at < ? AND payload NOT LIKE '{"pruned"%'`, now - 3_600_000);
  await run(ctx.db, `DELETE FROM server_commands WHERE created_at < ?`, now - 30 * 86_400_000);
  await run(ctx.db, `DELETE FROM oauth_states WHERE expires_at < ?`, now);
  await pruneSessions(ctx);
  await pruneRateLimits(ctx);
  await pruneNotifications(ctx);
}

export async function runScheduledMaintenance(ctx: AppContext): Promise<void> {
  try {
    const n = await sweepConnections(ctx);
    await pruneData(ctx);
    log("info", "maintenance.completed", { disconnectedNotified: n });
  } catch (err) {
    log("error", "maintenance.failed", { err });
  }
}
