import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTestApp, createUser, type TestApp } from "./helpers/app";
import { registerServer, getServer, listMyServers, setServerMember } from "@/modules/serveros/servers";
import { issueCredential, revokeCredential, authenticateAgent } from "@/modules/serveros/credentials";
import { queueCommand, getCommand } from "@/modules/serveros/commands";
import { processHeartbeat } from "@/modules/serveros/agent-service";
import { sweepConnections } from "@/modules/serveros/sweep";
import { listUserWorkspaces } from "@/lib/authz/check";
import { all, one } from "@/lib/db/sql";
import type { Heartbeat } from "@/modules/serveros/protocol";
import { Agent } from "../agent/src/agent.js";
import { POST as heartbeatRoute } from "@/app/api/agent/v1/heartbeat/route";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
  app.install();
});

const hb = (over: Partial<Heartbeat> = {}): Heartbeat => ({
  agentVersion: "0.1.0",
  mode: "live",
  capabilities: ["console", "players", "plugins", "config"],
  server: { software: "paper", version: "1.21.4", reachable: true, playersOnline: 1, playersMax: 20, players: [{ uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", name: "Notch" }], tps: [20, 20, 19.9] },
  host: { memUsed: 1, memTotal: 2, load1: 0.5, cpus: 4 },
  console: [{ ts: 1, level: "INFO", line: "[12:00:00 INFO]: Done (3.2s)!" }],
  bans: null,
  results: [],
  ...over,
});

async function setup(name = "ServerOwner") {
  const owner = await createUser(app, name);
  const ws = (await listUserWorkspaces(app.ctx, owner.user.id))[0]!;
  const { id } = await registerServer(app.ctx, owner.user, ws.id, { name: "Survival", address: "play.example.com", software: "paper", mcVersion: "1.21.4", environment: "production", description: "" });
  const cred = await issueCredential(app.ctx, owner.user, id, "test");
  const principal = (await authenticateAgent(app.ctx, `Bearer ${cred.token}`))!;
  return { owner, ws, serverId: id, cred, principal };
}

describe("registration and scoped access", () => {
  it("creator becomes server admin; other workspace members get no server access", async () => {
    const { owner, ws, serverId } = await setup();
    expect((await getServer(app.ctx, owner.user, serverId)).role).toBe("server_admin");
    const colleague = await createUser(app, "Colleague");
    app.db.sqlite.prepare(`INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, 'workspace_admin', 0)`).run(ws.id, colleague.user.id);
    await expect(getServer(app.ctx, colleague.user, serverId)).rejects.toMatchObject({ code: "not_found" });
    expect(await listMyServers(app.ctx, colleague.user)).toEqual([]);
    await setServerMember(app.ctx, owner.user, serverId, "Colleague", "server_moderator");
    expect((await getServer(app.ctx, colleague.user, serverId)).role).toBe("server_moderator");
  });

  it("only workspace members can be granted server roles", async () => {
    const { owner, serverId } = await setup();
    await createUser(app, "Outsider2");
    await expect(setServerMember(app.ctx, owner.user, serverId, "Outsider2", "server_viewer")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("credentials and connection status", () => {
  it("stores only token hashes and revocation takes effect immediately", async () => {
    const { owner, serverId, cred } = await setup();
    const rows = await all<{ token_hash: string }>(app.ctx.db, `SELECT token_hash FROM agent_credentials`);
    expect(JSON.stringify(rows)).not.toContain(cred.token);
    await revokeCredential(app.ctx, owner.user, serverId, cred.id);
    expect(await authenticateAgent(app.ctx, `Bearer ${cred.token}`)).toBeNull();
    expect(await authenticateAgent(app.ctx, "Bearer sxa_garbage")).toBeNull();
  });

  it("reports never_connected, online, then offline with a single disconnect notification", async () => {
    const { owner, serverId, principal } = await setup();
    expect((await getServer(app.ctx, owner.user, serverId)).connection.state).toBe("never_connected");
    await processHeartbeat(app.ctx, principal, hb());
    const online = await getServer(app.ctx, owner.user, serverId);
    expect(online.connection).toMatchObject({ state: "online", reportedVersion: "1.21.4", simulated: false });
    app.clock.now += 60_000;
    expect((await getServer(app.ctx, owner.user, serverId)).connection.state).toBe("offline");
    expect(await sweepConnections(app.ctx)).toBe(1);
    expect(await sweepConnections(app.ctx)).toBe(0);
    const n = await all(app.ctx.db, `SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'server.disconnected'`, owner.user.id);
    expect(n.length).toBe(1);
  });
});

describe("commands", () => {
  it("never queues commands for a disconnected server", async () => {
    const { owner, serverId } = await setup();
    await expect(queueCommand(app.ctx, owner.user, serverId, "console.command", { command: "say hi" })).rejects.toMatchObject({ code: "unavailable" });
    expect(await all(app.ctx.db, `SELECT 1 FROM server_commands`)).toEqual([]);
  });

  it("enforces permissions, payload rules and advertised capabilities", async () => {
    const { owner, serverId, principal } = await setup();
    const mod = await createUser(app, "Moddy");
    app.db.sqlite.prepare(`INSERT INTO server_memberships (server_id, user_id, role, created_at) VALUES (?, ?, 'server_moderator', 0)`).run(serverId, mod.user.id);
    await processHeartbeat(app.ctx, principal, hb());
    await expect(queueCommand(app.ctx, owner.user, serverId, "console.command", { command: "stop" })).rejects.toBeTruthy();
    await expect(queueCommand(app.ctx, owner.user, serverId, "datapack.deploy", { deploymentId: "x", fileName: "sythix-a.zip", sha256: "0".repeat(64), size: 1, reloadAfter: false })).rejects.toMatchObject({ code: "unavailable" });
    await expect(queueCommand(app.ctx, mod.user, serverId, "console.command", { command: "say hi" })).rejects.toMatchObject({ code: "forbidden" });
    await queueCommand(app.ctx, mod.user, serverId, "players.kick", { player: "Notch", reason: "afk" });
  });

  it("dispatches queued commands and records results; ignores results for foreign commands", async () => {
    const other = await setup("OtherOwner");
    const { owner, serverId, principal } = await setup();
    await processHeartbeat(app.ctx, principal, hb());
    const { id } = await queueCommand(app.ctx, owner.user, serverId, "console.command", { command: "say hello" });
    const res = await processHeartbeat(app.ctx, principal, hb());
    expect(res.commands).toEqual([{ id, kind: "console.command", payload: { command: "say hello" } }]);
    expect((await processHeartbeat(app.ctx, principal, hb())).commands).toEqual([]);

    // Another server's agent cannot complete this command.
    await processHeartbeat(app.ctx, other.principal, hb({ results: [{ commandId: id, ok: true, result: { output: "forged" } }] }));
    expect((await getCommand(app.ctx, owner.user, serverId, id)).status).toBe("dispatched");

    await processHeartbeat(app.ctx, principal, hb({ results: [{ commandId: id, ok: true, result: { output: "[Server] hello" } }] }));
    expect(await getCommand(app.ctx, owner.user, serverId, id)).toMatchObject({ status: "succeeded", result: { ok: true, data: { output: "[Server] hello" } } });
  });

  it("expires commands the agent never picks up", async () => {
    const { owner, serverId, principal } = await setup();
    await processHeartbeat(app.ctx, principal, hb());
    const { id } = await queueCommand(app.ctx, owner.user, serverId, "console.command", { command: "list" });
    app.clock.now += 6 * 60_000;
    await processHeartbeat(app.ctx, principal, hb());
    expect((await getCommand(app.ctx, owner.user, serverId, id)).status).toBe("expired");
  });
});

describe("agent <-> API end to end (in process)", () => {
  it("a simulated agent connects through the real route handler, executes a console command and reports back", async () => {
    const { owner, serverId, cred } = await setup();
    const dir = mkdtempSync(path.join(tmpdir(), "sythix-e2e-"));
    mkdirSync(path.join(dir, "plugins"), { recursive: true });
    writeFileSync(path.join(dir, "x"), "");
    const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
      const req = new Request(String(url), init);
      return heartbeatRoute(req, { params: Promise.resolve({}) });
    }) as typeof fetch;
    const agent = new Agent(
      { apiUrl: "http://localhost:3000", token: cred.token, mode: "simulated", serverDir: dir, worldName: "world", rcon: { host: "127.0.0.1", port: 1, password: "" }, allow: { console: true, players: true, plugins: true, configRead: true, configWrite: false, datapackDeploy: false }, deniedCommands: [] },
      undefined,
      fetchImpl,
    );
    try {
      await agent.tick();
      const s = await getServer(app.ctx, owner.user, serverId);
      expect(s.connection).toMatchObject({ state: "online", simulated: true });
      expect(s.connection.capabilities).toEqual(["console", "players", "plugins", "config"]);

      const { id } = await queueCommand(app.ctx, owner.user, serverId, "players.kick", { player: "Sample_Alex", reason: "test" });
      await agent.tick(); // receives + executes
      await agent.tick(); // reports result
      expect(await getCommand(app.ctx, owner.user, serverId, id)).toMatchObject({ status: "succeeded", result: { data: { output: "Kicked Sample_Alex: test" } } });
      const console = await all<{ line: string }>(app.ctx.db, `SELECT line FROM server_console_lines WHERE server_id = ?`, serverId);
      expect(console.some((l) => l.line.includes("SIMULATED"))).toBe(true);
      // Simulated connections never award the "first_server" achievement.
      expect(await one(app.ctx.db, `SELECT 1 FROM user_achievements WHERE achievement_id = 'first_server'`)).toBeNull();
    } finally {
      agent.stop();
    }
  });

  it("rejects browser-style requests and revoked credentials at the agent endpoint", async () => {
    const { owner, serverId, cred } = await setup();
    const withCookie = await heartbeatRoute(new Request("http://localhost/api/agent/v1/heartbeat", { method: "POST", headers: { authorization: `Bearer ${cred.token}`, cookie: "a=b", "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({}) });
    expect(withCookie.status).toBe(403);
    await revokeCredential(app.ctx, owner.user, serverId, cred.id);
    const revoked = await heartbeatRoute(new Request("http://localhost/api/agent/v1/heartbeat", { method: "POST", headers: { authorization: `Bearer ${cred.token}`, "content-type": "application/json" }, body: JSON.stringify(hb()) }), { params: Promise.resolve({}) });
    expect(revoked.status).toBe(401);
  });
});
