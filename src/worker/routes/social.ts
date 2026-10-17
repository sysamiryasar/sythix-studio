import { z } from "zod";
import type { Hono } from "hono";
import { commentSchema, createPostSchema, editPostSchema, LIMITS, REACTIONS, reportSchema } from "@shared/schemas";
import { body, ok, requireUser, type AppEnv } from "../app";
import * as social from "../services/social";
import * as media from "../services/media";
import { createReport } from "../services/moderation";
import { search } from "../services/search";
import { listNotifications, markRead, unreadCount } from "../services/notifications";
import { readUpload } from "./identity";
import { one } from "../lib/db";
import { notFound } from "../lib/errors";

const cursorOf = (v: string | undefined) => (v && v.length < 100 ? v : null);

export function socialRoutes(app: Hono<AppEnv>) {
  app.get("/feed", async (c) => {
    const tab = z.enum(["home", "following", "discover"]).catch("home").parse(c.req.query("tab"));
    return ok(c, await social.feed(c.get("ctx"), requireUser(c), tab, cursorOf(c.req.query("cursor"))));
  });
  app.get("/users/:username/posts", async (c) => {
    const kind = c.req.query("kind") === "media" ? "media" : "posts";
    return ok(c, await social.userPosts(c.get("ctx"), requireUser(c), c.req.param("username"), kind, cursorOf(c.req.query("cursor"))));
  });
  app.get("/tags/trending", async (c) => {
    requireUser(c);
    return ok(c, await social.trending(c.get("ctx")));
  });
  app.get("/tags/:tag", async (c) => ok(c, await social.tagPosts(c.get("ctx"), requireUser(c), c.req.param("tag").slice(0, 50), cursorOf(c.req.query("cursor")))));
  app.get("/bookmarks", async (c) => ok(c, await social.bookmarksPage(c.get("ctx"), requireUser(c), cursorOf(c.req.query("cursor")))));

  app.post("/posts", async (c) => ok(c, await social.createPost(c.get("ctx"), requireUser(c), await body(c, createPostSchema)), 201));
  app.get("/posts/:id", async (c) => ok(c, await social.getPost(c.get("ctx"), requireUser(c), c.req.param("id"))));
  app.patch("/posts/:id", async (c) => ok(c, await social.editPost(c.get("ctx"), requireUser(c), c.req.param("id"), (await body(c, editPostSchema)).body)));
  app.delete("/posts/:id", async (c) => {
    await social.deletePost(c.get("ctx"), requireUser(c), c.req.param("id"));
    return ok(c, { ok: true });
  });
  app.put("/posts/:id/reaction", async (c) => {
    const { kind } = await body(c, z.object({ kind: z.enum(REACTIONS) }));
    return ok(c, await social.react(c.get("ctx"), requireUser(c), c.req.param("id"), kind));
  });
  app.delete("/posts/:id/reaction", async (c) => ok(c, await social.unreact(c.get("ctx"), requireUser(c), c.req.param("id"))));
  app.post("/posts/:id/repost", async (c) => ok(c, await social.repost(c.get("ctx"), requireUser(c), c.req.param("id"))));
  app.delete("/posts/:id/repost", async (c) => {
    const v = requireUser(c);
    await social.unrepost(c.get("ctx"), v, c.req.param("id"));
    return ok(c, await social.getPost(c.get("ctx"), v, c.req.param("id")));
  });
  app.put("/posts/:id/bookmark", async (c) => {
    await social.bookmark(c.get("ctx"), requireUser(c), c.req.param("id"), true);
    return ok(c, { bookmarked: true });
  });
  app.delete("/posts/:id/bookmark", async (c) => {
    await social.bookmark(c.get("ctx"), requireUser(c), c.req.param("id"), false);
    return ok(c, { bookmarked: false });
  });
  app.get("/posts/:id/comments", async (c) => ok(c, await social.listComments(c.get("ctx"), requireUser(c), c.req.param("id"))));
  app.post("/posts/:id/comments", async (c) => {
    const b = await body(c, commentSchema);
    return ok(c, await social.addComment(c.get("ctx"), requireUser(c), c.req.param("id"), b.body, b.parentId), 201);
  });
  app.delete("/comments/:id", async (c) => {
    await social.deleteComment(c.get("ctx"), requireUser(c), c.req.param("id"));
    return ok(c, { ok: true });
  });

  app.post("/media", async (c) => {
    const u = requireUser(c);
    return ok(c, await media.upload(c.get("ctx"), u.id, await readUpload(c.req.raw, LIMITS.videoBytes)), 201);
  });
  app.get("/media/:id", async (c) => {
    const u = requireUser(c);
    const ctx = c.get("ctx");
    const m = await one<{ owner_id: string; post_id: string | null; r2_key: string; content_type: string }>(ctx.db, `SELECT owner_id, post_id, r2_key, content_type FROM media WHERE id = ?`, c.req.param("id"));
    if (!m) throw notFound("File");
    const allowed = m.post_id ? await social.canViewPost(ctx, u.id, m.post_id) : m.owner_id === u.id;
    if (!allowed) throw notFound("File");
    return media.serveObject(ctx, m.r2_key, m.content_type, c.req.header("range"));
  });

  app.get("/search", async (c) => ok(c, await search(c.get("ctx"), requireUser(c), c.req.query("q") ?? "")));
  app.post("/reports", async (c) => {
    await createReport(c.get("ctx"), requireUser(c), await body(c, reportSchema));
    return ok(c, { ok: true }, 201);
  });

  app.get("/notifications", async (c) => {
    const u = requireUser(c);
    const ctx = c.get("ctx");
    return ok(c, { items: await listNotifications(ctx, u.id), unread: await unreadCount(ctx, u.id) });
  });
  app.get("/notifications/unread", async (c) => ok(c, { unread: await unreadCount(c.get("ctx"), requireUser(c).id) }));
  app.post("/notifications/read", async (c) => {
    const { ids } = await body(c, z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(40)).max(100)]) }));
    await markRead(c.get("ctx"), requireUser(c).id, ids);
    return ok(c, { ok: true });
  });
}
