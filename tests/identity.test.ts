import { describe, expect, it } from "vitest";
import { Client, createTestApp, signUp } from "./helpers/app";
import type { Me, ProfileView } from "@shared/types";
import { hashPassword, verifyPassword } from "@worker/lib/crypto";

describe("SythiX ID", () => {
  it("hashes passwords with PBKDF2 and verifies them", async () => {
    const h = await hashPassword("a long password", 1000);
    expect(h.startsWith("pbkdf2$1000$")).toBe(true);
    expect(await verifyPassword("a long password", h)).toBe(true);
    expect(await verifyPassword("a long passworD", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("makes the first account the owner and later accounts members", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Founder");
    const b = await signUp(t, "Second");
    expect((await a.get<Me>("/me")).data.role).toBe("owner");
    expect((await b.get<Me>("/me")).data.role).toBe("member");
  });

  it("respects OWNER_EMAILS when set", async () => {
    const t = createTestApp({ OWNER_EMAILS: "boss@example.com" });
    const first = await signUp(t, "first");
    const boss = await signUp(t, "boss");
    expect((await first.get<Me>("/me")).data.role).toBe("member");
    expect((await boss.get<Me>("/me")).data.role).toBe("owner");
  });

  it("rejects duplicate usernames and emails, and weak passwords", async () => {
    const t = createTestApp();
    await signUp(t, "taken");
    const c = new Client(t);
    expect((await c.post("/auth/register", { email: "other@example.com", username: "TAKEN", displayName: "x", password: "correct horse battery" })).status).toBe(409);
    expect((await c.post("/auth/register", { email: "taken@example.com", username: "fresh", displayName: "x", password: "correct horse battery" })).status).toBe(409);
    const weak = await c.post("/auth/register", { email: "w@example.com", username: "weak", displayName: "x", password: "short" });
    expect(weak.status).toBe(422);
  });

  it("logs in by email or username with a generic error, and logs out", async () => {
    const t = createTestApp();
    await signUp(t, "Notch");
    const c = new Client(t);
    expect((await c.post("/auth/login", { identifier: "notch@example.com", password: "nope nope" })).error?.message).toBe("Incorrect email/username or password.");
    expect((await c.post("/auth/login", { identifier: "nobody", password: "nope nope" })).error?.message).toBe("Incorrect email/username or password.");
    expect((await c.post("/auth/login", { identifier: "Notch", password: "correct horse battery" })).status).toBe(200);
    expect((await c.get<Me>("/me")).data.username).toBe("Notch");
    await c.post("/auth/logout");
    expect((await c.get("/me")).data).toBeNull();
  });

  it("rate limits login attempts", async () => {
    const t = createTestApp();
    await signUp(t, "Herobrine");
    const c = new Client(t);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await c.post("/auth/login", { identifier: "herobrine", password: "wrong wrong" })).status);
    expect(codes).toContain(429);
  });

  it("blocks cross-site state-changing requests", async () => {
    const t = createTestApp();
    const a = await signUp(t);
    const r = await a.req("PATCH", "/me/privacy", { profileVisibility: "private", dmPolicy: "nobody", allowMentions: false, showActivity: false }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });

  it("updates profile, privacy and preferences, and validates input", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Alex");
    const p = await a.patch<Me>("/me/profile", { displayName: "Alex ✨", bio: "Builder", location: "Overworld", website: "https://example.com", pronouns: "they/them", accent: "cyan", banner: "nebula" });
    expect(p.data.displayName).toBe("Alex ✨");
    expect(p.data.profile.banner).toBe("nebula");
    expect((await a.patch("/me/profile", { displayName: "x", bio: "", location: "", website: "javascript:alert(1)", pronouns: "", accent: "cyan", banner: "nebula" })).status).toBe(422);
    const pref = await a.patch<Me>("/me/preferences", { theme: "light", reducedMotion: true, navCollapsed: true, dashboard: [{ id: "trending", visible: false }] });
    expect(pref.data.preferences.theme).toBe("light");
    expect(pref.data.preferences.dashboard[0]).toEqual({ id: "trending", visible: false });
    expect(pref.data.preferences.dashboard).toHaveLength(6);
  });

  it("hides profile content according to privacy settings", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Private1");
    const viewer = await signUp(t, "Viewer1");
    await owner.patch("/me/privacy", { profileVisibility: "followers", dmPolicy: "followers", allowMentions: true, showActivity: true });
    expect((await viewer.get<ProfileView>("/users/Private1")).data.canViewContent).toBe(false);
    await viewer.post("/users/Private1/follow");
    expect((await viewer.get<ProfileView>("/users/Private1")).data.canViewContent).toBe(true);
    await owner.del("/users/Viewer1/follower");
    expect((await viewer.get<ProfileView>("/users/Private1")).data.canViewContent).toBe(false);
  });

  it("changes password and revokes other sessions", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Pwd");
    const other = new Client(t);
    await other.post("/auth/login", { identifier: "Pwd", password: "correct horse battery" });
    expect((await a.post("/me/password", { currentPassword: "wrong", newPassword: "another long password" })).status).toBe(400);
    expect((await a.post("/me/password", { currentPassword: "correct horse battery", newPassword: "another long password" })).status).toBe(200);
    expect((await other.get("/me")).data).toBeNull();
    expect((await a.get<Me>("/me")).data.username).toBe("Pwd");
  });

  it("exports data and deletes the account permanently", async () => {
    const t = createTestApp();
    await signUp(t, "Owner0");
    const a = await signUp(t, "Leaver");
    await a.post("/posts", { body: "bye #farewell", visibility: "public" });
    const exp = await t.fetchApi("/me/export", { headers: { cookie: a.cookie } });
    const data = (await exp.json()) as { posts: unknown[]; account: { username: string } };
    expect(data.account.username).toBe("Leaver");
    expect(data.posts).toHaveLength(1);
    expect((await a.post("/me/delete", { password: "wrong", confirm: "DELETE" })).status).toBe(400);
    expect((await a.post("/me/delete", { password: "correct horse battery", confirm: "DELETE" })).status).toBe(200);
    expect(t.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM users WHERE username = 'Leaver'`).get()).toEqual({ n: 0 });
    expect(t.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM posts`).get()).toEqual({ n: 0 });
  });

  it("refuses to delete the only owner", async () => {
    const t = createTestApp();
    const a = await signUp(t, "OnlyOwner");
    expect((await a.post("/me/delete", { password: "correct horse battery", confirm: "DELETE" })).status).toBe(400);
  });

  it("only enforces Turnstile when both keys are configured", async () => {
    const half = createTestApp({ TURNSTILE_SECRET_KEY: "secret" });
    await signUp(half, "NoWidget"); // secret alone: not enforced (no widget could render)
    const full = createTestApp({ TURNSTILE_SECRET_KEY: "secret", TURNSTILE_SITE_KEY: "site" });
    expect((await new Client(full).get<{ turnstileSiteKey: string }>("/platform/public-config")).data.turnstileSiteKey).toBe("site");
    const r = await new Client(full).post("/auth/register", { email: "bot@example.com", username: "botty", displayName: "Bot", password: "correct horse battery" });
    expect(r.status).toBe(400);
    expect(r.error?.message).toBe("Complete the human check.");
  });

  it("requires sign-in for the API", async () => {
    const t = createTestApp();
    expect((await new Client(t).get("/feed")).status).toBe(401);
  });
});
