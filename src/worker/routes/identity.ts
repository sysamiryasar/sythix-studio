import { z } from "zod";
import type { Hono } from "hono";
import { registerSchema, loginSchema, profileSchema, privacySchema, preferencesSchema, passwordChangeSchema, deleteAccountSchema } from "@shared/schemas";
import { body, ok, requireUser, type AppEnv } from "../app";
import { sessionCookie, SESSION_TTL_MS } from "../lib/session";
import { AppError } from "../lib/errors";
import * as account from "../services/account";
import * as users from "../services/users";
import * as media from "../services/media";
import { serveObject } from "../services/media";
import { one } from "../lib/db";

const MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);

export function identityRoutes(app: Hono<AppEnv>) {
  app.post("/auth/register", async (c) => {
    const r = await account.register(c.get("ctx"), await body(c, registerSchema));
    c.header("set-cookie", sessionCookie(c.env, r.token, MAX_AGE));
    return ok(c, await account.getMe(c.get("ctx"), r.userId), 201);
  });

  app.post("/auth/login", async (c) => {
    const ctx = c.get("ctx");
    const r = await account.login(ctx, await body(c, loginSchema));
    c.header("set-cookie", sessionCookie(c.env, r.token, MAX_AGE));
    return ok(c, { ok: true });
  });

  app.post("/auth/logout", async (c) => {
    const u = c.get("user");
    if (u) await account.logout(c.get("ctx"), u.sessionId);
    c.header("set-cookie", sessionCookie(c.env, "", 0));
    return ok(c, { ok: true });
  });

  app.get("/me", async (c) => {
    const u = c.get("user");
    if (!u) return ok(c, null);
    const me = await account.getMe(c.get("ctx"), u.id);
    return ok(c, { ...me, accentName: await account.getAccentName(c.get("ctx"), u.id) });
  });

  app.patch("/me/profile", async (c) => {
    const u = requireUser(c);
    await account.updateProfile(c.get("ctx"), u.id, await body(c, profileSchema));
    return ok(c, await account.getMe(c.get("ctx"), u.id));
  });
  app.patch("/me/privacy", async (c) => {
    const u = requireUser(c);
    await account.updatePrivacy(c.get("ctx"), u.id, await body(c, privacySchema));
    return ok(c, await account.getMe(c.get("ctx"), u.id));
  });
  app.patch("/me/preferences", async (c) => {
    const u = requireUser(c);
    await account.updatePreferences(c.get("ctx"), u.id, await body(c, preferencesSchema));
    return ok(c, await account.getMe(c.get("ctx"), u.id));
  });
  app.post("/me/password", async (c) => {
    const u = requireUser(c);
    const b = await body(c, passwordChangeSchema);
    await account.changePassword(c.get("ctx"), u.id, u.sessionId, b.currentPassword, b.newPassword);
    return ok(c, { ok: true });
  });
  app.post("/me/avatar", async (c) => {
    const u = requireUser(c);
    const bytes = await readUpload(c.req.raw, 2 * 1024 * 1024);
    await media.setAvatar(c.get("ctx"), u.id, bytes);
    return ok(c, await account.getMe(c.get("ctx"), u.id));
  });
  app.delete("/me/avatar", async (c) => {
    const u = requireUser(c);
    await media.clearAvatar(c.get("ctx"), u.id);
    return ok(c, await account.getMe(c.get("ctx"), u.id));
  });
  app.get("/me/sessions", async (c) => {
    const u = requireUser(c);
    return ok(c, await account.listSessions(c.get("ctx"), u.id, u.sessionId));
  });
  app.delete("/me/sessions/:id", async (c) => {
    const u = requireUser(c);
    await account.revokeSession(c.get("ctx"), u.id, c.req.param("id"));
    return ok(c, { ok: true });
  });
  app.get("/me/export", async (c) => {
    const u = requireUser(c);
    const data = await account.exportData(c.get("ctx"), u.id);
    c.header("content-disposition", `attachment; filename="sythix-unite-${u.username}.json"`);
    return c.json(data);
  });
  app.post("/me/delete", async (c) => {
    const u = requireUser(c);
    const b = await body(c, deleteAccountSchema);
    await account.deleteAccount(c.get("ctx"), u.id, b.password);
    c.header("set-cookie", sessionCookie(c.env, "", 0));
    return ok(c, { ok: true });
  });
  app.get("/me/blocks", async (c) => ok(c, await users.listBlocked(c.get("ctx"), requireUser(c).id)));

  // Avatars are visible to any signed-in user (like display names).
  app.get("/avatars/:userId", async (c) => {
    requireUser(c);
    const p = await one<{ avatar_key: string | null }>(c.get("ctx").db, `SELECT avatar_key FROM profiles WHERE user_id = ?`, c.req.param("userId"));
    if (!p?.avatar_key) throw new AppError("not_found", "No avatar.");
    return serveObject(c.get("ctx"), p.avatar_key, media.avatarContentType(p.avatar_key), undefined);
  });

  app.get("/users/:username", async (c) => ok(c, await users.getProfile(c.get("ctx"), requireUser(c).id, c.req.param("username"))));
  app.post("/users/:username/follow", async (c) => {
    await users.follow(c.get("ctx"), requireUser(c), c.req.param("username"));
    return ok(c, { ok: true });
  });
  app.delete("/users/:username/follow", async (c) => {
    await users.unfollow(c.get("ctx"), requireUser(c).id, c.req.param("username"));
    return ok(c, { ok: true });
  });
  app.delete("/users/:username/follower", async (c) => {
    await users.removeFollower(c.get("ctx"), requireUser(c).id, c.req.param("username"));
    return ok(c, { ok: true });
  });
  app.post("/users/:username/block", async (c) => {
    await users.block(c.get("ctx"), requireUser(c).id, c.req.param("username"));
    return ok(c, { ok: true });
  });
  app.delete("/users/:username/block", async (c) => {
    await users.unblock(c.get("ctx"), requireUser(c).id, c.req.param("username"));
    return ok(c, { ok: true });
  });
  app.get("/users/:username/:list{followers|following}", async (c) =>
    ok(c, await users.listFollows(c.get("ctx"), requireUser(c).id, c.req.param("username"), c.req.param("list") as "followers" | "following")),
  );
  app.get("/suggestions", async (c) => ok(c, await users.suggestions(c.get("ctx"), requireUser(c).id, Number(z.coerce.number().int().min(1).max(20).catch(5).parse(c.req.query("limit"))))));
}

/** Reads a raw or multipart (`file` field) upload, enforcing a byte cap before buffering. */
export async function readUpload(req: Request, maxBytes: number): Promise<Uint8Array> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes + 64 * 1024) throw new AppError("payload_too_large", `Files can be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const ct = req.headers.get("content-type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const f = form.get("file") as unknown as File | string | null;
    if (!f || typeof f === "string") throw new AppError("bad_request", "Attach a file in the `file` field.");
    if (f.size > maxBytes) throw new AppError("payload_too_large", `Files can be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    return new Uint8Array(await f.arrayBuffer());
  }
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new AppError("payload_too_large", `Files can be at most ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  if (!buf.byteLength) throw new AppError("bad_request", "The upload is empty.");
  return buf;
}
