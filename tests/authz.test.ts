import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/app";
import { all } from "@/lib/db/sql";
import { PLATFORM_MATRIX, SERVER_MATRIX, WORKSPACE_MATRIX, workspaceCan, serverCan } from "@/lib/authz/roles";

describe("permission matrix", () => {
  it("matches the roles seeded in D1", async () => {
    const app = createTestApp();
    const rows = await all<{ role_id: string; permission: string }>(app.ctx.db, `SELECT role_id, permission FROM role_permissions`);
    const fromDb = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!fromDb.has(r.role_id)) fromDb.set(r.role_id, new Set());
      fromDb.get(r.role_id)!.add(r.permission);
    }
    const workspaceDbRole = (r: string) => r;
    const expected: Record<string, readonly string[]> = { ...PLATFORM_MATRIX, ...SERVER_MATRIX };
    for (const [role, perms] of Object.entries(WORKSPACE_MATRIX)) expected[workspaceDbRole(role)] = perms;
    for (const [role, perms] of Object.entries(expected)) {
      expect([...(fromDb.get(role) ?? [])].sort(), role).toEqual([...perms].sort());
    }
    const roles = await all<{ id: string }>(app.ctx.db, `SELECT id FROM roles`);
    expect(roles.map((r) => r.id).sort()).toEqual(Object.keys(expected).sort());
  });

  it("workspace roles never grant server permissions", () => {
    for (const perms of Object.values(WORKSPACE_MATRIX)) {
      for (const p of perms) expect(Object.values(SERVER_MATRIX).flat()).not.toContain(p === "server.list" || p === "server.register" ? "__" : p);
    }
    expect(workspaceCan("workspace_owner", "server.register")).toBe(true);
    expect(serverCan(null, "server.view")).toBe(false);
  });

  it("moderators cannot execute console commands or deploy", () => {
    expect(serverCan("server_moderator", "server.players.moderate")).toBe(true);
    expect(serverCan("server_moderator", "server.console.execute")).toBe(false);
    expect(serverCan("server_moderator", "server.deploy")).toBe(false);
    expect(serverCan("server_viewer", "server.console.read")).toBe(false);
  });
});
