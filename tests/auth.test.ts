import { describe, expect, it, beforeEach } from "vitest";
import { createTestApp, createUser, type TestApp } from "./helpers/app";
import { register, login, verifyEmail, requestPasswordReset, resetPassword, changePassword } from "@/lib/auth/service";
import { resolveSession, revokeSession, listSessions } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/security/crypto";
import { all, one } from "@/lib/db/sql";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
});

async function lastEmailToken(email: string): Promise<string> {
  const row = await one<{ body_text: string }>(app.ctx.db, `SELECT body_text FROM email_outbox WHERE to_email = ? ORDER BY rowid DESC LIMIT 1`, email);
  return /token=([A-Za-z0-9_-]+)/.exec(row!.body_text)![1]!;
}

describe("password hashing", () => {
  it("verifies correct passwords and rejects wrong ones", async () => {
    const h = await hashPassword("a very long password");
    expect(h.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect((await verifyPassword("a very long password", h)).ok).toBe(true);
    expect((await verifyPassword("a very long passworD", h)).ok).toBe(false);
  });
  it("flags weaker hashes for rehash", async () => {
    const h = await hashPassword("another password!", 1000);
    expect(await verifyPassword("another password!", h)).toEqual({ ok: true, needsRehash: true });
  });
  it("rejects malformed stored hashes", async () => {
    expect((await verifyPassword("x", "plaintext")).ok).toBe(false);
  });
});

describe("registration and login", () => {
  it("provisions workspace, profile and starter cosmetics; requires verification before login", async () => {
    await register(app.ctx, { email: "Alex@Example.com", username: "Alex_01", password: "correct horse battery" });
    const u = await one<{ id: string; password_hash: string; email: string }>(app.ctx.db, `SELECT id, password_hash, email FROM users`);
    expect(u!.email).toBe("alex@example.com");
    expect(u!.password_hash).not.toContain("correct horse");
    const ws = await all(app.ctx.db, `SELECT role FROM workspace_memberships WHERE user_id = ?`, u!.id);
    expect(ws).toEqual([{ role: "workspace_owner" }]);
    const inv = await all(app.ctx.db, `SELECT cosmetic_id FROM cosmetic_inventory WHERE user_id = ?`, u!.id);
    expect(inv.length).toBeGreaterThan(0);

    await expect(login(app.ctx, { email: "alex@example.com", password: "correct horse battery" })).rejects.toMatchObject({ code: "forbidden" });

    await verifyEmail(app.ctx, await lastEmailToken("alex@example.com"));
    const { token } = await login(app.ctx, { email: "alex@example.com", password: "correct horse battery" });
    const session = await resolveSession(app.ctx, token);
    expect(session?.username).toBe("Alex_01");
    expect(session?.emailVerified).toBe(true);

    // Verification awards the welcome achievement.
    const ach = await one(app.ctx.db, `SELECT 1 AS x FROM user_achievements WHERE user_id = ? AND achievement_id = 'welcome'`, u!.id);
    expect(ach).toBeTruthy();
  });

  it("stores only token hashes for sessions", async () => {
    const { token, user } = await createUser(app);
    const rows = await all<{ token_hash: string }>(app.ctx.db, `SELECT token_hash FROM sessions WHERE user_id = ?`, user.id);
    expect(rows.every((r) => r.token_hash !== token && r.token_hash.length === 64)).toBe(true);
  });

  it("does not reveal existing emails at registration", async () => {
    await createUser(app, "taken");
    const res = await register(app.ctx, { email: "taken@example.com", username: "other_name", password: "correct horse battery" });
    // Same answer as for a new address (no email provider is configured in tests).
    expect(res.status).toBe("awaiting_admin_verification");
    expect(await one(app.ctx.db, `SELECT 1 FROM users WHERE username = 'other_name'`)).toBeNull();
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    await createUser(app, "Steve");
    await expect(register(app.ctx, { email: "new@example.com", username: "steve", password: "correct horse battery" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("rejects wrong passwords with a generic message", async () => {
    await createUser(app, "Notch");
    await expect(login(app.ctx, { email: "notch@example.com", password: "wrong password" })).rejects.toMatchObject({
      code: "unauthenticated",
      message: "Incorrect email or password.",
    });
    await expect(login(app.ctx, { email: "nobody@example.com", password: "wrong password" })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rate limits repeated login attempts", async () => {
    await createUser(app, "Herobrine");
    const attempts = Array.from({ length: 11 }, () => login(app.ctx, { email: "herobrine@example.com", password: "nope nope nope" }).catch((e) => e.code));
    const codes = await Promise.all(attempts);
    expect(codes).toContain("rate_limited");
  });

  it("verification tokens are single-use", async () => {
    await register(app.ctx, { email: "once@example.com", username: "once", password: "correct horse battery" });
    const t = await lastEmailToken("once@example.com");
    await verifyEmail(app.ctx, t);
    await expect(verifyEmail(app.ctx, t)).rejects.toMatchObject({ code: "bad_request" });
  });

  it("grants platform_owner only to configured, verified emails", async () => {
    const owned = createTestApp({ PLATFORM_OWNER_EMAILS: "boss@example.com" });
    const { user } = await createUser(owned, "boss");
    expect(user.platformRole).toBe("platform_owner");
    const { user: other } = await createUser(owned, "minion");
    expect(other.platformRole).toBe("member");
  });
});

describe("password reset and sessions", () => {
  it("reset revokes all sessions and the token expires", async () => {
    const { token, user } = await createUser(app, "Resetter");
    await requestPasswordReset(app.ctx, "resetter@example.com");
    const t = await lastEmailToken("resetter@example.com");
    await resetPassword(app.ctx, t, "a brand new password");
    expect(await resolveSession(app.ctx, token)).toBeNull();
    await expect(resetPassword(app.ctx, t, "another new password")).rejects.toBeTruthy();
    const { token: t2 } = await login(app.ctx, { email: "resetter@example.com", password: "a brand new password" });
    expect((await resolveSession(app.ctx, t2))?.id).toBe(user.id);
  });

  it("expired reset tokens are rejected", async () => {
    await createUser(app, "Late");
    await requestPasswordReset(app.ctx, "late@example.com");
    const t = await lastEmailToken("late@example.com");
    app.clock.now += 2 * 60 * 60_000;
    await expect(resetPassword(app.ctx, t, "a brand new password")).rejects.toMatchObject({ code: "bad_request" });
  });

  it("change password keeps current session and revokes others", async () => {
    const { user, token } = await createUser(app, "Changer");
    const { token: other } = await login(app.ctx, { email: "changer@example.com", password: "correct horse battery staple" });
    await changePassword(app.ctx, user, "correct horse battery staple", "even better password");
    expect(await resolveSession(app.ctx, token)).not.toBeNull();
    expect(await resolveSession(app.ctx, other)).toBeNull();
  });

  it("users can revoke only their own sessions", async () => {
    const a = await createUser(app, "AliceS");
    const b = await createUser(app, "BobS");
    expect(await revokeSession(app.ctx, b.user.id, a.user.sessionId)).toBe(false);
    expect(await resolveSession(app.ctx, a.token)).not.toBeNull();
    expect(await revokeSession(app.ctx, a.user.id, a.user.sessionId)).toBe(true);
    expect(await resolveSession(app.ctx, a.token)).toBeNull();
    expect(await listSessions(app.ctx, a.user.id)).toEqual([]);
  });

  it("sessions expire", async () => {
    const { token } = await createUser(app);
    app.clock.now += 31 * 86_400_000;
    expect(await resolveSession(app.ctx, token)).toBeNull();
  });
});
