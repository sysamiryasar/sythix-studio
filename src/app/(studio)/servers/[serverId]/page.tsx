import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { all, one } from "@/lib/db/sql";
import { ServerOverview } from "@/components/servers/overview";

export default async function ServerOverviewPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  const latest = await one<{ players_online: number | null; players_max: number | null; tps_1m: number | null; host_mem_used: number | null; host_mem_total: number | null; host_load_1m: number | null; host_cpu_count: number | null; bucket_start: number }>(
    ctx.db,
    `SELECT * FROM server_telemetry WHERE server_id = ? ORDER BY bucket_start DESC LIMIT 1`,
    serverId,
  );
  const events = await all<{ action: string; created_at: number; actor: string | null }>(
    ctx.db,
    `SELECT a.action, a.created_at, u.username AS actor FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id WHERE a.server_id = ? ORDER BY a.created_at DESC LIMIT 8`,
    serverId,
  );
  const alerts = await all<{ title: string; created_at: number }>(
    ctx.db,
    `SELECT title, created_at FROM notifications WHERE user_id = ? AND link LIKE ? AND kind IN ('server.disconnected','server.connected','deployment.result') ORDER BY created_at DESC LIMIT 5`,
    user.id,
    `/servers/${serverId}%`,
  );
  return <ServerOverview server={s} latest={latest} events={events} alerts={alerts} now={ctx.now()} />;
}
