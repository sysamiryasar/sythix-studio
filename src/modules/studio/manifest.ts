import { defineModule } from "../types";
import { one } from "@/lib/db/sql";

export const studioModule = defineModule({
  id: "studio",
  name: "Studio Core",
  description: "Application shell, accounts, workspaces, permissions, notifications, search and the module registry.",
  version: "0.1.0",
  icon: "layout-dashboard",
  core: true,
  nav: [{ href: "/", label: "Studio", icon: "layout-dashboard" }],
  permissions: ["workspace.manage", "workspace.members.manage", "platform.modules.manage", "platform.flags.manage", "platform.audit.read"],
  dependencies: {},
  platform: ">=0.1.0 <1.0.0",
  migrations: ["0001_core.sql"],
  featureFlags: [{ key: "studio.command-palette", description: "Keyboard command palette (Ctrl/Cmd+K).", defaultEnabled: true }],
  async healthCheck(ctx) {
    const r = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM users`);
    return { status: "healthy", detail: `Database reachable (${r?.n ?? 0} accounts).` };
  },
});
