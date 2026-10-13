import { defineModule } from "../types";
import { one } from "@/lib/db/sql";
import { HEARTBEAT_STALE_MS } from "./constants";

export const serverModule = defineModule({
  id: "serveros",
  name: "ServerOS",
  description: "Paper/Purpur server registration, agent connectivity, telemetry, console, moderation and plugins.",
  version: "0.1.0",
  icon: "server",
  nav: [{ href: "/servers", label: "ServerOS", icon: "server" }],
  permissions: [
    "server.register", "server.view", "server.manage", "server.credentials.manage", "server.members.manage", "server.console.read",
    "server.console.execute", "server.players.moderate", "server.plugins.read", "server.plugins.manage", "server.deploy",
  ],
  dependencies: { studio: "^0.1.0" },
  platform: ">=0.1.0 <1.0.0",
  migrations: ["0003_serveros.sql", "0006_serveros_agent.sql"],
  featureFlags: [{ key: "serveros.config-editor", description: "Allow editing plugin configuration files through the agent.", defaultEnabled: true }],
  async healthCheck(ctx) {
    const r = await one<{ total: number; online: number }>(
      ctx.db,
      `SELECT COUNT(*) AS total, SUM(CASE WHEN c.last_heartbeat_at > ? THEN 1 ELSE 0 END) AS online
         FROM servers s LEFT JOIN server_connections c ON c.server_id = s.id`,
      ctx.now() - HEARTBEAT_STALE_MS,
    );
    return { status: "healthy", detail: `${r?.online ?? 0} of ${r?.total ?? 0} registered servers have a live agent.` };
  },
});
