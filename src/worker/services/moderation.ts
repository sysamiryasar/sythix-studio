import type { z } from "zod";
import type { Ctx } from "../env";
import type { reportSchema } from "@shared/schemas";
import { platformCan, platformRank, type PlatformRole } from "@shared/permissions";
import { all, one, run } from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { enforce, LIMIT } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import { notify } from "./notifications";
import { canViewPost, type Viewer } from "./social";
import { summariesById } from "./users";

export async function createReport(ctx: Ctx, viewer: Viewer, input: z.infer<typeof reportSchema>) {
  await enforce(ctx, LIMIT.report, viewer.id);
  // The reporter must be able to see what they report.
  let exists = false;
  switch (input.targetType) {
    case "user":
      if (input.targetId === viewer.id) throw badRequest("You can't report yourself.");
      exists = !!(await one(ctx.db, `SELECT 1 FROM users WHERE id = ?`, input.targetId));
      break;
    case "post":
      exists = await canViewPost(ctx, viewer.id, input.targetId);
      break;
    case "comment": {
      const c = await one<{ post_id: string }>(ctx.db, `SELECT post_id FROM comments WHERE id = ? AND deleted = 0`, input.targetId);
      exists = !!c && (await canViewPost(ctx, viewer.id, c.post_id));
      break;
    }
    case "message":
      exists = !!(await one(
        ctx.db,
        `SELECT 1 FROM messages m WHERE m.id = ? AND m.deleted_at IS NULL AND (
           EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = m.conversation_id AND cm.user_id = ?)
           OR EXISTS (SELECT 1 FROM channels ch JOIN community_members x ON x.community_id = ch.community_id AND x.user_id = ? WHERE ch.id = m.channel_id))`,
        input.targetId,
        viewer.id,
        viewer.id,
      ));
      break;
    case "community":
      exists = !!(await one(ctx.db, `SELECT 1 FROM communities WHERE id = ?`, input.targetId));
      break;
  }
  if (!exists) throw notFound("Reported content");
  try {
    await run(
      ctx.db,
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId("rpt"),
      viewer.id,
      input.targetType,
      input.targetId,
      input.reason,
      input.details,
      ctx.now(),
    );
  } catch (err) {
    if (/UNIQUE/i.test((err as Error).message)) throw conflict("You've already reported this. Our moderators will review it.");
    throw err;
  }
}

function requirePerm(viewer: Viewer, perm: Parameters<typeof platformCan>[1]) {
  if (!platformCan(viewer.role, perm)) throw forbidden();
}

export async function listReports(ctx: Ctx, viewer: Viewer, status: "open" | "actioned" | "dismissed") {
  requirePerm(viewer, "moderation.review");
  const rows = await all<{ id: string; reporter_id: string | null; target_type: string; target_id: string; reason: string; details: string; status: string; created_at: number; resolution_note: string | null }>(
    ctx.db,
    `SELECT id, reporter_id, target_type, target_id, reason, details, status, created_at, resolution_note FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 100`,
    status,
  );
  const reporters = await summariesById(ctx, rows.flatMap((r) => (r.reporter_id ? [r.reporter_id] : [])));
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      reporter: r.reporter_id ? (reporters.get(r.reporter_id) ?? null) : null,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      note: r.resolution_note,
      createdAt: r.created_at,
      preview: await preview(ctx, r.target_type, r.target_id),
    })),
  );
}

async function preview(ctx: Ctx, type: string, id: string): Promise<{ text: string; link: string | null; authorId: string | null; state: string }> {
  if (type === "post") {
    const p = await one<{ body: string; author_id: string; status: string }>(ctx.db, `SELECT body, author_id, status FROM posts WHERE id = ?`, id);
    return p ? { text: p.body.slice(0, 280), link: `/social/post/${id}`, authorId: p.author_id, state: p.status } : { text: "(deleted)", link: null, authorId: null, state: "deleted" };
  }
  if (type === "comment") {
    const c = await one<{ body: string; author_id: string; post_id: string; deleted: number }>(ctx.db, `SELECT body, author_id, post_id, deleted FROM comments WHERE id = ?`, id);
    return c ? { text: c.deleted ? "(deleted)" : c.body.slice(0, 280), link: `/social/post/${c.post_id}#${id}`, authorId: c.author_id, state: c.deleted ? "deleted" : "visible" } : { text: "(deleted)", link: null, authorId: null, state: "deleted" };
  }
  if (type === "message") {
    const m = await one<{ body: string; author_id: string; deleted_at: number | null }>(ctx.db, `SELECT body, author_id, deleted_at FROM messages WHERE id = ?`, id);
    return m ? { text: m.deleted_at ? "(deleted)" : m.body.slice(0, 280), link: null, authorId: m.author_id, state: m.deleted_at ? "deleted" : "visible" } : { text: "(deleted)", link: null, authorId: null, state: "deleted" };
  }
  if (type === "user") {
    const u = await one<{ username: string; status: string }>(ctx.db, `SELECT username, status FROM users WHERE id = ?`, id);
    return u ? { text: `@${u.username}`, link: `/u/${u.username}`, authorId: id, state: u.status } : { text: "(deleted account)", link: null, authorId: null, state: "deleted" };
  }
  const c = await one<{ name: string; slug: string; status: string; owner_id: string }>(ctx.db, `SELECT name, slug, status, owner_id FROM communities WHERE id = ?`, id);
  return c ? { text: c.name, link: `/connect/c/${c.slug}`, authorId: c.owner_id, state: c.status } : { text: "(deleted)", link: null, authorId: null, state: "deleted" };
}

/** Resolves a report. "remove" hides a post/community or deletes a comment/message. */
export async function resolveReport(ctx: Ctx, viewer: Viewer, id: string, action: "dismiss" | "remove", note: string) {
  requirePerm(viewer, "moderation.review");
  const r = await one<{ target_type: string; target_id: string; status: string }>(ctx.db, `SELECT target_type, target_id, status FROM reports WHERE id = ?`, id);
  if (!r || r.status !== "open") throw notFound("Open report");
  if (action === "remove") await removeContent(ctx, viewer, r.target_type, r.target_id);
  // Resolve every open report about the same target together.
  await run(
    ctx.db,
    `UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ? WHERE target_type = ? AND target_id = ? AND status = 'open'`,
    action === "remove" ? "actioned" : "dismissed",
    viewer.id,
    ctx.now(),
    note,
    r.target_type,
    r.target_id,
  );
  await audit(ctx, { actorId: viewer.id, action: `report.${action}`, targetType: r.target_type, targetId: r.target_id, meta: { report: id, note } });
}

async function removeContent(ctx: Ctx, viewer: Viewer, type: string, id: string) {
  requirePerm(viewer, "moderation.hide_content");
  if (type === "post") {
    const p = await one<{ author_id: string }>(ctx.db, `SELECT author_id FROM posts WHERE id = ?`, id);
    await run(ctx.db, `UPDATE posts SET status = 'hidden' WHERE id = ?`, id);
    if (p) await notify(ctx, p.author_id, { kind: "moderation", title: "One of your posts was hidden by a moderator", body: "It broke the community guidelines. Only you can still see it.", link: `/social/post/${id}` });
  } else if (type === "comment") {
    const c = await one<{ post_id: string; deleted: number }>(ctx.db, `SELECT post_id, deleted FROM comments WHERE id = ?`, id);
    if (c && !c.deleted) {
      await run(ctx.db, `UPDATE comments SET deleted = 1, body = '' WHERE id = ?`, id);
      await run(ctx.db, `UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?`, c.post_id);
    }
  } else if (type === "message") {
    await run(ctx.db, `UPDATE messages SET deleted_at = ?, body = '' WHERE id = ?`, ctx.now(), id);
  } else if (type === "community") {
    await run(ctx.db, `UPDATE communities SET status = 'hidden' WHERE id = ?`, id);
  } else if (type === "user") {
    throw badRequest("Use suspend for accounts.");
  }
}

export async function setPostHidden(ctx: Ctx, viewer: Viewer, postId: string, hidden: boolean) {
  requirePerm(viewer, "moderation.hide_content");
  const n = await run(ctx.db, `UPDATE posts SET status = ? WHERE id = ?`, hidden ? "hidden" : "visible", postId);
  if (!n) throw notFound("Post");
  await audit(ctx, { actorId: viewer.id, action: hidden ? "post.hidden" : "post.restored", targetType: "post", targetId: postId });
}

async function targetUser(ctx: Ctx, viewer: Viewer, userId: string) {
  const u = await one<{ id: string; role: PlatformRole; status: string }>(ctx.db, `SELECT id, role, status FROM users WHERE id = ?`, userId);
  if (!u) throw notFound("User");
  if (u.id === viewer.id || platformRank(u.role) >= platformRank(viewer.role)) throw forbidden("You can only act on accounts ranked below you.");
  return u;
}

export async function setSuspended(ctx: Ctx, viewer: Viewer, userId: string, suspended: boolean, reason: string) {
  requirePerm(viewer, "users.suspend");
  await targetUser(ctx, viewer, userId);
  await run(ctx.db, `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`, suspended ? "suspended" : "active", ctx.now(), userId);
  if (suspended) await run(ctx.db, `DELETE FROM sessions WHERE user_id = ?`, userId);
  await audit(ctx, { actorId: viewer.id, action: suspended ? "user.suspended" : "user.unsuspended", targetType: "user", targetId: userId, meta: { reason } });
}

export async function setRole(ctx: Ctx, viewer: Viewer, userId: string, role: PlatformRole) {
  requirePerm(viewer, "users.set_role");
  const u = await one<{ id: string }>(ctx.db, `SELECT id FROM users WHERE id = ?`, userId);
  if (!u || u.id === viewer.id) throw forbidden("You can't change your own role.");
  await run(ctx.db, `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, role, ctx.now(), userId);
  await audit(ctx, { actorId: viewer.id, action: "user.role_changed", targetType: "user", targetId: userId, meta: { role } });
}

export async function listUsers(ctx: Ctx, viewer: Viewer, q: string) {
  requirePerm(viewer, "users.suspend");
  const like = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
  return all<{ id: string; username: string; display_name: string; email: string; role: PlatformRole; status: string; created_at: number }>(
    ctx.db,
    `SELECT id, username, display_name, email, role, status, created_at FROM users WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 100`,
    like,
    like,
  );
}

export async function auditLog(ctx: Ctx, viewer: Viewer) {
  requirePerm(viewer, "platform.audit");
  return all<{ id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; meta: string; created_at: number }>(
    ctx.db,
    `SELECT id, actor_id, action, target_type, target_id, meta, created_at FROM audit_log ORDER BY created_at DESC LIMIT 200`,
  );
}
