import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createTestApp, createUser, type TestApp } from "./helpers/app";
import { listUserWorkspaces } from "@/lib/authz/check";
import { createProject } from "@/modules/forgeos/projects";
import { upsertItem } from "@/modules/forgeos/entities";
import { runExport } from "@/modules/forgeos/export";
import { registerServer } from "@/modules/serveros/servers";
import { issueCredential } from "@/modules/serveros/credentials";
import { planDeployment, confirmDeployment, getDeployment } from "@/modules/ecosystem/deployments";
import { search } from "@/modules/ecosystem/search";
import { blockUser } from "@/modules/nexusid/social";
import { one } from "@/lib/db/sql";
import { Agent } from "../agent/src/agent.js";
import { POST as heartbeatRoute } from "@/app/api/agent/v1/heartbeat/route";
import { GET as artifactRoute } from "@/app/api/agent/v1/deployments/[id]/artifact/route";
import type { ItemInput } from "@/modules/forgeos/schema";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
  app.install();
});

const item: ItemInput = {
  identifier: "ember_sword",
  name: "Ember Sword",
  baseMaterial: "iron_sword",
  rarity: "rare",
  textureAssetId: null,
  data: { lore: [], glint: false, unbreakable: false, attributes: [], enchantments: [{ id: "fire_aspect", level: 2 }], consumeEffects: [], abilityIds: [], onHitEffects: [] },
};

function agentFetch(): typeof fetch {
  return (async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    const req = new Request(u, init);
    if (u.pathname === "/api/agent/v1/heartbeat") return heartbeatRoute(req, { params: Promise.resolve({}) });
    const m = /^\/api\/agent\/v1\/deployments\/([^/]+)\/artifact$/.exec(u.pathname);
    if (m) return artifactRoute(req, { params: Promise.resolve({ id: m[1]! }) });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

async function world(opts: { projectTarget?: string; serverVersion?: string; environment?: "production" | "development"; datapackDeploy?: boolean } = {}) {
  const { user } = await createUser(app, "Builder");
  const ws = (await listUserWorkspaces(app.ctx, user.id))[0]!;
  const project = await createProject(app.ctx, user, ws.id, { name: "Ember", description: "", targetVersion: opts.projectTarget ?? "1.21.4", folder: "", visibility: "public", namespace: "ember" });
  await upsertItem(app.ctx, user, project.id, item);
  const exp = await runExport(app.ctx, user, project.id, "datapack");
  const { id: serverId } = await registerServer(app.ctx, user, ws.id, { name: "Prod SMP", address: "", software: "paper", mcVersion: opts.serverVersion ?? "1.21.4", environment: opts.environment ?? "production", description: "" });
  const cred = await issueCredential(app.ctx, user, serverId, "agent");
  const dir = mkdtempSync(path.join(tmpdir(), "sythix-deploy-"));
  const agent = new Agent(
    { apiUrl: "http://localhost:3000", token: cred.token, mode: "simulated", serverDir: dir, worldName: "world", rcon: { host: "127.0.0.1", port: 1, password: "" }, allow: { console: true, players: true, plugins: true, configRead: true, configWrite: false, datapackDeploy: opts.datapackDeploy ?? true }, deniedCommands: [] },
    undefined,
    agentFetch(),
  );
  await agent.tick();
  return { user, ws, project, exp, serverId, agent, dir };
}

describe("ForgeOS -> ServerOS deployment", () => {
  it("plans, requires typed confirmation for production, deploys through the agent and records the result", async () => {
    const w = await world();
    try {
      const { id, plan } = await planDeployment(app.ctx, w.user, { projectId: w.project.id, exportId: w.exp.id, serverId: w.serverId, reloadAfter: true });
      expect(plan.checks.filter((c) => c.blocking && !c.ok)).toEqual([]);
      expect(plan.requiresTypedConfirmation).toBe(true);
      expect(plan.action).toMatchObject({ fileName: "sythix-ember.zip", restartsServer: false, backupExisting: true });

      await expect(confirmDeployment(app.ctx, w.user, id, "wrong name")).rejects.toMatchObject({ code: "validation_failed" });
      await confirmDeployment(app.ctx, w.user, id, "Prod SMP");
      await w.agent.tick(); // receive command, download artifact, verify hash, install
      await w.agent.tick(); // report result

      const dep = await getDeployment(app.ctx, w.user, id);
      expect(dep.status).toBe("succeeded");
      expect(dep.result).toMatchObject({ ok: true, data: { path: "world/datapacks/sythix-ember.zip", reloaded: true, enabled: true } });
      const installed = path.join(w.dir, "world/datapacks/sythix-ember.zip");
      expect(existsSync(installed)).toBe(true);
      expect(createHash("sha256").update(readFileSync(installed)).digest("hex")).toBe(w.exp.sha256);
      expect(await one(app.ctx.db, `SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'deployment.result'`, w.user.id)).not.toBeNull();
      expect(await one(app.ctx.db, `SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = 'first_deploy'`, w.user.id)).not.toBeNull();
    } finally {
      w.agent.stop();
    }
  });

  it("blocks version mismatches and agents that have not enabled deployment", async () => {
    const w = await world({ projectTarget: "1.21.1", datapackDeploy: false, environment: "development" });
    try {
      const { id, plan } = await planDeployment(app.ctx, w.user, { projectId: w.project.id, exportId: w.exp.id, serverId: w.serverId, reloadAfter: false });
      const failing = plan.checks.filter((c) => c.blocking && !c.ok).map((c) => c.name);
      expect(failing).toEqual(["Agent allows datapack deployment", "Minecraft version matches export target"]);
      await expect(confirmDeployment(app.ctx, w.user, id)).rejects.toMatchObject({ code: "validation_failed" });
    } finally {
      w.agent.stop();
    }
  });

  it("requires a server role in addition to the project role", async () => {
    const w = await world();
    try {
      const dev = await createUser(app, "DevOnly");
      app.db.sqlite.prepare(`INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, 'developer', 0)`).run(w.ws.id, dev.user.id);
      await expect(planDeployment(app.ctx, dev.user, { projectId: w.project.id, exportId: w.exp.id, serverId: w.serverId, reloadAfter: false })).rejects.toMatchObject({ code: "not_found" });
      app.db.sqlite.prepare(`INSERT INTO server_memberships (server_id, user_id, role, created_at) VALUES (?, ?, 'server_moderator', 0)`).run(w.serverId, dev.user.id);
      await expect(planDeployment(app.ctx, dev.user, { projectId: w.project.id, exportId: w.exp.id, serverId: w.serverId, reloadAfter: false })).rejects.toMatchObject({ code: "forbidden" });
    } finally {
      w.agent.stop();
    }
  });

  it("the artifact endpoint only serves in-flight deployments to the target server's agent", async () => {
    const w = await world();
    try {
      const { id } = await planDeployment(app.ctx, w.user, { projectId: w.project.id, exportId: w.exp.id, serverId: w.serverId, reloadAfter: false });
      const other = await issueCredential(app.ctx, w.user, (await registerServer(app.ctx, w.user, w.ws.id, { name: "Other", address: "", software: "paper", mcVersion: "1.21.4", environment: "development", description: "" })).id, "x");
      const fetchAs = (token: string) => artifactRoute(new Request(`http://localhost/api/agent/v1/deployments/${id}/artifact`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id }) });
      expect((await fetchAs(other.token)).status).toBe(404); // planned, not dispatched — and the wrong server
    } finally {
      w.agent.stop();
    }
  });
});

describe("global search", () => {
  it("returns only content the viewer can access", async () => {
    const owner = await createUser(app, "Searcher");
    const ws = (await listUserWorkspaces(app.ctx, owner.user.id))[0]!;
    const p = await createProject(app.ctx, owner.user, ws.id, { name: "Secret Blades", description: "", targetVersion: "1.21.4", folder: "", visibility: "private" });
    await upsertItem(app.ctx, owner.user, p.id, { ...item, identifier: "secret_blade", name: "Secret Blade" });
    const stranger = await createUser(app, "Stranger3");
    expect((await search(app.ctx, owner.user, "secret")).map((r) => r.type).sort()).toEqual(["item", "project"]);
    expect(await search(app.ctx, stranger.user, "secret")).toEqual([]);
  });

  it("hides blocked players and finds settings and modules", async () => {
    const a = await createUser(app, "FindMe");
    const b = await createUser(app, "Hunter");
    expect((await search(app.ctx, b.user, "findme")).some((r) => r.type === "player")).toBe(true);
    await blockUser(app.ctx, a.user, "Hunter");
    expect((await search(app.ctx, b.user, "findme")).some((r) => r.type === "player")).toBe(false);
    expect((await search(app.ctx, b.user, "password")).some((r) => r.type === "setting")).toBe(true);
    expect((await search(app.ctx, b.user, "ServerOS")).some((r) => r.type === "module")).toBe(true);
  });
});
