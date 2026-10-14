import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { all, one } from "@/lib/db/sql";
import { listNotifications } from "@/lib/notifications";
import { getModuleStates } from "@/modules/service";
import { listMyServers } from "@/modules/serveros/servers";

export interface PendingTask {
  title: string;
  detail: string;
  href: string;
  tone: "warning" | "info" | "danger";
}

/** Aggregates the Studio home: only modules that are available contribute data. */
export async function loadHome(ctx: AppContext, user: SessionUser, workspaceId: string) {
  const states = await getModuleStates(ctx);
  const on = (id: string) => states.find((s) => s.manifest.id === id)?.available ?? false;
  const tasks: PendingTask[] = [];
  if (user.platformRole === "platform_owner") {
    const pendingUsers = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NULL`);
    if (pendingUsers?.n) tasks.push({ title: `${pendingUsers.n} account${pendingUsers.n > 1 ? "s" : ""} awaiting verification`, detail: "No email provider is configured; verify them in Users.", href: "/studio/users", tone: "warning" });
  }
  if (!user.emailVerified) tasks.push({ title: "Verify your email", detail: "Required for servers, teams and friend requests.", href: "/settings", tone: "warning" });

  const projects = on("forgeos")
    ? await all<{ id: string; name: string; target_version: string; updated_at: number; item_count: number }>(
        ctx.db,
        `SELECT p.id, p.name, p.target_version, p.updated_at, (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id) AS item_count
           FROM projects p JOIN workspace_memberships m ON m.workspace_id = p.workspace_id AND m.user_id = ?
          WHERE p.workspace_id = ? AND p.archived_at IS NULL ORDER BY p.updated_at DESC LIMIT 5`,
        user.id,
        workspaceId,
      )
    : [];
  const exports = on("forgeos")
    ? await all<{ id: string; project_id: string; name: string; format: string; status: string; revision: number; created_at: number }>(
        ctx.db,
        `SELECT e.id, e.project_id, p.name, e.format, e.status, e.revision, e.created_at FROM export_jobs e JOIN projects p ON p.id = e.project_id
          WHERE e.created_by = ? ORDER BY e.created_at DESC LIMIT 5`,
        user.id,
      )
    : [];
  if (exports[0]?.status === "failed") tasks.push({ title: `Export of ${exports[0].name} failed validation`, detail: "Review the validation report.", href: `/forge/${exports[0].project_id}/exports`, tone: "danger" });

  const servers = on("serveros") ? await listMyServers(ctx, user) : [];
  for (const s of servers) {
    if (s.role === "server_admin" && s.connection.state === "never_connected") tasks.push({ title: `Connect the agent for ${s.name}`, detail: "No heartbeat has been received yet.", href: `/servers/${s.id}`, tone: "info" });
    if (s.connection.state === "offline") tasks.push({ title: `${s.name} is disconnected`, detail: "Check the agent on the host.", href: `/servers/${s.id}`, tone: "danger" });
  }
  if (on("forgeos") && on("serveros")) {
    const planned = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM deployment_jobs WHERE requested_by = ? AND status = 'planned' AND created_at > ?`, user.id, ctx.now() - 30 * 60_000);
    if (planned?.n) tasks.push({ title: `${planned.n} deployment plan${planned.n > 1 ? "s" : ""} awaiting confirmation`, detail: "Plans expire after 30 minutes.", href: "/forge", tone: "info" });
  }
  if (on("nexusid")) {
    const fr = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM friendships WHERE addressee_id = ? AND status = 'pending'`, user.id);
    if (fr?.n) tasks.push({ title: `${fr.n} friend request${fr.n > 1 ? "s" : ""}`, detail: "Accept or decline.", href: "/nexus/friends", tone: "info" });
    const inv = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM team_members WHERE user_id = ? AND status = 'invited'`, user.id);
    if (inv?.n) tasks.push({ title: `${inv.n} team invitation${inv.n > 1 ? "s" : ""}`, detail: "Review in Teams.", href: "/nexus/teams", tone: "info" });
  }
  const achievements = on("nexusid") ? await one<{ n: number; total: number }>(ctx.db, `SELECT (SELECT COUNT(*) FROM user_achievements WHERE user_id = ?) AS n, (SELECT COUNT(*) FROM achievements) AS total`, user.id) : null;

  return {
    modules: states.map((s) => ({ id: s.manifest.id, name: s.manifest.name, version: s.manifest.version, available: s.available, health: s.health.status, href: s.manifest.nav[0]?.href ?? "/" })),
    projects,
    exports,
    servers,
    notifications: (await listNotifications(ctx, user.id, 6)),
    tasks,
    achievements,
  };
}
