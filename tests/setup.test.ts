import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createTestD1 } from "./helpers/d1";
import { createTestApp, createUser } from "./helpers/app";
import { applyPendingMigrations, splitStatements } from "@/lib/db/migrate";
import { adminVerifyUser, login, register } from "@/lib/auth/service";
import { resolveSession } from "@/lib/auth/session";
import { all, one } from "@/lib/db/sql";

function realMigrations() {
  const dir = path.resolve(import.meta.dirname, "../migrations");
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), "utf8") }));
}

describe("runtime migrator", () => {
  it("splits statements without breaking quoted semicolons or comments", () => {
    const sql = `-- a; comment\nCREATE TABLE a (x TEXT DEFAULT 'a;b');\n/* block; */ INSERT INTO a VALUES ("q;uoted");\n\n`;
    expect(splitStatements(sql)).toHaveLength(2);
    expect(splitStatements(sql)[0]).toContain("'a;b'");
  });

  it("applies the real migrations to an empty database exactly once, Wrangler-compatibly", async () => {
    const db = createTestD1();
    const migrations = realMigrations();
    expect(await applyPendingMigrations(db, migrations)).toEqual(migrations.map((m) => m.name));
    expect(await applyPendingMigrations(db, migrations)).toEqual([]);
    const names = await all<{ name: string }>(db, `SELECT name FROM d1_migrations ORDER BY id`);
    expect(names.map((n) => n.name)).toEqual(migrations.map((m) => m.name));
    expect(await one(db, `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'`)).toBeTruthy();
  });

  it("rolls back a failing migration and records nothing for it", async () => {
    const db = createTestD1();
    const bad = [{ name: "0001_bad.sql", sql: "CREATE TABLE t (x INTEGER);\nINSERT INTO missing VALUES (1);" }];
    await expect(applyPendingMigrations(db, bad)).rejects.toThrow();
    expect(await one(db, `SELECT 1 FROM sqlite_master WHERE name = 't'`)).toBeNull();
    expect(await one(db, `SELECT 1 FROM d1_migrations`)).toBeNull();
  });
});

describe("first-owner bootstrap (no email provider)", () => {
  it("makes the first account a verified platform owner; later accounts wait for an admin", async () => {
    const app = createTestApp({ PLATFORM_OWNER_EMAILS: undefined });
    expect((await register(app.ctx, { email: "first@example.com", username: "first", password: "correct horse battery" })).status).toBe("first_owner_ready");
    const { token } = await login(app.ctx, { email: "first@example.com", password: "correct horse battery" });
    const owner = await resolveSession(app.ctx, token);
    expect(owner?.platformRole).toBe("platform_owner");

    app.clock.now += 60 * 60_000;
    expect((await register(app.ctx, { email: "second@example.com", username: "second", password: "correct horse battery" })).status).toBe(
      "awaiting_admin_verification",
    );
    await expect(login(app.ctx, { email: "second@example.com", password: "correct horse battery" })).rejects.toBeTruthy();
    const second = await one<{ id: string; platform_role: string }>(app.ctx.db, `SELECT id, platform_role FROM users WHERE email = 'second@example.com'`);
    expect(second?.platform_role).toBe("member");
    await adminVerifyUser(app.ctx, owner!.id, second!.id);
    expect((await login(app.ctx, { email: "second@example.com", password: "correct horse battery" })).token).toBeTruthy();
  });

  it("only bootstraps a configured owner email when PLATFORM_OWNER_EMAILS is set", async () => {
    const app = createTestApp({ PLATFORM_OWNER_EMAILS: "boss@example.com" });
    expect((await register(app.ctx, { email: "first@example.com", username: "first", password: "correct horse battery" })).status).toBe(
      "awaiting_admin_verification",
    );
    const { user } = await createUser(app, "boss");
    expect(user.platformRole).toBe("platform_owner");
  });

  it("never bootstraps when email delivery is configured", async () => {
    const app = createTestApp({ PLATFORM_OWNER_EMAILS: undefined, RESEND_API_KEY: "re_test" });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    try {
      expect((await register(app.ctx, { email: "first@example.com", username: "first", password: "correct horse battery" })).status).toBe("verification_sent");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
