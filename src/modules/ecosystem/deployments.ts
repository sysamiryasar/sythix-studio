import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { all, one, parseJson, run } from "@/lib/db/sql";
import { recordAudit } from "@/lib/audit";
import { requireWorkspace, serverRole } from "@/lib/authz/check";
import { serverCan } from "@/lib/authz/roles";
import { isFlagEnabled, isModuleAvailable } from "@/modules/service";
import { targetForServerVersion } from "@/modules/forgeos/versions";
import { queueCommand } from "@/modules/serveros/commands";
import { connectionState } from "@/modules/serveros/servers";

export interface PlanCheck {
  name: string;
  ok: boolean;
  detail: string;
  blocking: boolean;
}

export interface DeploymentPlan {
  project: { id: string; name: string; namespace: string; revision: number };
  export: { id: string; format: string; target: string; sha256: string; size: number };
  server: { id: string; name: string; environment: string; software: string; version: string; simulated: boolean };
  action: { fileName: string; path: string; reloadAfter: boolean; backupExisting: true; restartsServer: false };
  checks: PlanCheck[];
  requiresTypedConfirmation: boolean;
}

interface Ctx {
  project: { id: string; workspace_id: string; name: string; namespace: string };
  exp: { id: string; revision: number; format: string; target_version: string; status: string; sha256: string | null; size_bytes: number | null };
  server: { id: string; name: string; environment: string; software: string; mc_version: string; workspace_id: string };
  conn: { last_heartbeat_at: number | null; capabilities: string; reported_version: string | null; reported_software: string | null; simulated: number } | null;
}

async function gather(ctx: AppContext, user: SessionUser, projectId: string, exportId: string, serverId: string): Promise<Ctx> {
  const project = await one<Ctx["project"]>(ctx.db, `SELECT id, workspace_id, name, namespace FROM projects WHERE id = ?`, projectId);
  if (!project) throw notFound("Project");
  await requireWorkspace(ctx, user, project.workspace_id, "project.deploy.request");
  const exp = await one<Ctx["exp"]>(ctx.db, `SELECT id, revision, format, target_version, status, sha256, size_bytes FROM export_jobs WHERE id = ? AND project_id = ?`, exportId, projectId);
  if (!exp) throw notFound("Export");
  // Deploying requires its own server role; the project role alone is never enough.
  const role = await serverRole(ctx, user.id, serverId);
  if (!role) throw notFound("Server");
  if (!serverCan(role, "server.deploy")) throw new AppError("forbidden", "You need the server administrator role on this server to deploy to it.");
  const server = await one<Ctx["server"]>(ctx.db, `SELECT id, name, environment, software, mc_version, workspace_id FROM servers WHERE id = ?`, serverId);
  if (!server) throw notFound("Server");
  const conn = await one<Ctx["conn"]>(ctx.db, `SELECT last_heartbeat_at, capabilities, reported_version, reported_software, simulated FROM server_connections WHERE server_id = ?`, serverId);
  return { project, exp, server, conn };
}

function evaluate(ctx: AppContext, c: Ctx, flags: { deployFlag: boolean; serverosAvailable: boolean }): PlanCheck[] {
  const online = connectionState(c.conn?.last_heartbeat_at ?? null, ctx.now()) === "online";
  const caps = parseJson<string[]>(c.conn?.capabilities, []);
  const serverVersion = c.conn?.reported_version ?? c.server.mc_version;
  const mapped = targetForServerVersion(serverVersion);
  const software = c.conn?.reported_software ?? c.server.software;
  return [
    { name: "Deployments enabled", ok: flags.deployFlag && flags.serverosAvailable, detail: flags.deployFlag ? (flags.serverosAvailable ? "ForgeOS → ServerOS deployment is enabled." : "ServerOS is unavailable.") : "Disabled by the forgeos.server-deploy feature flag.", blocking: true },
    { name: "Export is a validated datapack", ok: c.exp.status === "succeeded" && c.exp.format === "datapack" && !!c.exp.sha256, detail: `Export ${c.exp.format} r${c.exp.revision} (${c.exp.status}).`, blocking: true },
    { name: "Agent connected", ok: online, detail: online ? "Heartbeat received recently." : "The server's agent is disconnected.", blocking: true },
    { name: "Agent allows datapack deployment", ok: caps.includes("datapack.deploy"), detail: caps.includes("datapack.deploy") ? "allow.datapackDeploy is enabled on the agent." : "Enable allow.datapackDeploy in the agent's sythix-agent.json (off by default).", blocking: true },
    { name: "Supported server software", ok: software === "paper" || software === "purpur", detail: `Server runs ${software}.`, blocking: true },
    {
      name: "Minecraft version matches export target",
      ok: mapped?.id === c.exp.target_version,
      detail: mapped ? `Server ${serverVersion} uses the ${mapped.id} data format; export targets ${c.exp.target_version}.` : `Server version ${serverVersion} has no supported ForgeOS export target.`,
      blocking: true,
    },
    { name: "Sample environment", ok: !c.conn?.simulated, detail: c.conn?.simulated ? "This agent is simulated: files are written to its sample directory, not a real world." : "Real server.", blocking: false },
  ];
}

export async function planDeployment(ctx: AppContext, user: SessionUser, input: { projectId: string; exportId: string; serverId: string; reloadAfter: boolean }): Promise<{ id: string; plan: DeploymentPlan }> {
  const c = await gather(ctx, user, input.projectId, input.exportId, input.serverId);
  const checks = evaluate(ctx, c, { deployFlag: await isFlagEnabled(ctx, "forgeos.server-deploy", c.project.workspace_id), serverosAvailable: await isModuleAvailable(ctx, "serveros") });
  const fileName = `sythix-${c.project.namespace.replace(/_/g, "-")}.zip`;
  const plan: DeploymentPlan = {
    project: { id: c.project.id, name: c.project.name, namespace: c.project.namespace, revision: c.exp.revision },
    export: { id: c.exp.id, format: c.exp.format, target: c.exp.target_version, sha256: c.exp.sha256 ?? "", size: c.exp.size_bytes ?? 0 },
    server: { id: c.server.id, name: c.server.name, environment: c.server.environment, software: c.conn?.reported_software ?? c.server.software, version: c.conn?.reported_version ?? c.server.mc_version, simulated: c.conn?.simulated === 1 },
    action: { fileName, path: `world/datapacks/${fileName}`, reloadAfter: input.reloadAfter, backupExisting: true, restartsServer: false },
    checks,
    requiresTypedConfirmation: c.server.environment === "production",
  };
  const id = newId("dep");
  await run(
    ctx.db,
    `INSERT INTO deployment_jobs (id, project_id, export_id, server_id, status, plan, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?)`,
    id, c.project.id, c.exp.id, c.server.id, JSON.stringify(plan), user.id, ctx.now(), ctx.now(),
  );
  await recordAudit(ctx, { actorId: user.id, action: "deployment.planned", targetType: "deployment", targetId: id, serverId: c.server.id, workspaceId: c.project.workspace_id, metadata: { exportId: c.exp.id, blocking: checks.filter((x) => x.blocking && !x.ok).map((x) => x.name) } });
  return { id, plan };
}

/**
 * Executes a reviewed plan. Every check is re-evaluated at confirmation time;
 * production servers require the server name typed exactly.
 */
export async function confirmDeployment(ctx: AppContext, user: SessionUser, deploymentId: string, confirmText?: string): Promise<{ commandId: string }> {
  const dep = await one<{ id: string; project_id: string; export_id: string; server_id: string; status: string; plan: string; requested_by: string }>(ctx.db, `SELECT * FROM deployment_jobs WHERE id = ?`, deploymentId);
  if (!dep || dep.requested_by !== user.id) throw notFound("Deployment plan");
  if (dep.status !== "planned") throw badRequest(`This deployment is already ${dep.status}.`);
  if (ctx.now() - (await one<{ created_at: number }>(ctx.db, `SELECT created_at FROM deployment_jobs WHERE id = ?`, deploymentId))!.created_at > 30 * 60_000) {
    throw badRequest("This plan is more than 30 minutes old. Generate a new plan.");
  }
  const plan = parseJson<DeploymentPlan>(dep.plan, null as unknown as DeploymentPlan);
  const c = await gather(ctx, user, dep.project_id, dep.export_id, dep.server_id);
  const checks = evaluate(ctx, c, { deployFlag: await isFlagEnabled(ctx, "forgeos.server-deploy", c.project.workspace_id), serverosAvailable: await isModuleAvailable(ctx, "serveros") });
  const failing = checks.filter((x) => x.blocking && !x.ok);
  if (failing.length) throw new AppError("validation_failed", `Deployment blocked: ${failing.map((f) => f.name).join(", ")}.`, failing);
  if (c.server.environment === "production" && confirmText !== c.server.name) throw new AppError("validation_failed", `Type the server name "${c.server.name}" to confirm a production deployment.`);

  // Dispatched first so the agent is allowed to download the artifact.
  await run(ctx.db, `UPDATE deployment_jobs SET status = 'dispatched', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`, user.id, ctx.now(), ctx.now(), dep.id);
  try {
    const { id } = await queueCommand(ctx, user, dep.server_id, "datapack.deploy", {
      deploymentId: dep.id,
      fileName: plan.action.fileName,
      sha256: c.exp.sha256,
      size: c.exp.size_bytes,
      reloadAfter: plan.action.reloadAfter,
    });
    await run(ctx.db, `UPDATE deployment_jobs SET command_id = ? WHERE id = ?`, id, dep.id);
    await recordAudit(ctx, { actorId: user.id, action: "deployment.confirmed", targetType: "deployment", targetId: dep.id, serverId: dep.server_id, workspaceId: c.project.workspace_id, metadata: { environment: c.server.environment } });
    return { commandId: id };
  } catch (err) {
    await run(ctx.db, `UPDATE deployment_jobs SET status = 'failed', result = ?, updated_at = ? WHERE id = ?`, JSON.stringify({ ok: false, error: (err as Error).message }), ctx.now(), dep.id);
    throw err;
  }
}

export async function cancelDeployment(ctx: AppContext, user: SessionUser, deploymentId: string): Promise<void> {
  const n = await run(ctx.db, `UPDATE deployment_jobs SET status = 'cancelled', updated_at = ? WHERE id = ? AND requested_by = ? AND status = 'planned'`, ctx.now(), deploymentId, user.id);
  if (!n) throw notFound("Planned deployment");
}

export interface DeploymentRow {
  id: string;
  status: string;
  created_at: number;
  updated_at: number;
  project_id: string;
  project_name: string;
  server_id: string;
  server_name: string;
  revision: number;
  requested_by: string;
  result: string | null;
}

const DEP_SELECT = `SELECT d.id, d.status, d.created_at, d.updated_at, d.project_id, p.name AS project_name, d.server_id, s.name AS server_name, e.revision, u.username AS requested_by, d.result
  FROM deployment_jobs d JOIN projects p ON p.id = d.project_id JOIN servers s ON s.id = d.server_id JOIN export_jobs e ON e.id = d.export_id JOIN users u ON u.id = d.requested_by`;

export async function listServerDeployments(ctx: AppContext, serverId: string) {
  return all<DeploymentRow>(ctx.db, `${DEP_SELECT} WHERE d.server_id = ? ORDER BY d.created_at DESC LIMIT 50`, serverId);
}

export async function getDeployment(ctx: AppContext, user: SessionUser, id: string) {
  const d = await one<DeploymentRow & { plan: string; workspace_id: string }>(ctx.db, `${DEP_SELECT.replace("d.result", "d.result, d.plan, p.workspace_id")} WHERE d.id = ?`, id);
  if (!d) throw notFound("Deployment");
  await requireWorkspace(ctx, user, d.workspace_id, "project.view");
  return { ...d, plan: parseJson<DeploymentPlan>(d.plan, null as unknown as DeploymentPlan), result: parseJson(d.result, null) };
}

/** Servers the user can deploy to (server_admin), for the deploy picker. */
export async function deployableServers(ctx: AppContext, user: SessionUser) {
  return all<{ id: string; name: string; environment: string; mc_version: string }>(
    ctx.db,
    `SELECT s.id, s.name, s.environment, s.mc_version FROM servers s JOIN server_memberships m ON m.server_id = s.id AND m.user_id = ? WHERE m.role = 'server_admin' ORDER BY s.name`,
    user.id,
  );
}
