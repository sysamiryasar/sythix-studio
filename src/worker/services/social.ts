import type { z } from "zod";
import type { Ctx } from "../env";
import type { CommentView, MediaView, Page, PostView } from "@shared/types";
import type { createPostSchema, ReactionKind } from "@shared/schemas";
import { platformCan, type PlatformRole } from "@shared/permissions";
import { all, decodeCursor, encodeCursor, inList, likePattern, one, run, stmt, type Bind } from "../lib/db";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { enforce, LIMIT } from "../lib/rate-limit";
import { notify } from "./notifications";
import { deleteObjects } from "./media";
import { summariesById, findByUsername, canViewProfileContent } from "./users";

export interface Viewer {
  id: string;
  username: string;
  displayName: string;
  role: PlatformRole;
}

interface PostRow {
  id: string;
  author_id: string;
  body: string;
  visibility: PostView["visibility"];
  community_id: string | null;
  repost_of: string | null;
  reaction_count: number;
  comment_count: number;
  repost_count: number;
  status: "visible" | "hidden";
  created_at: number;
  edited_at: number | null;
}

const POST_COLS = `p.id, p.author_id, p.body, p.visibility, p.community_id, p.repost_of, p.reaction_count, p.comment_count, p.repost_count, p.status, p.created_at, p.edited_at`;
const POST_FROM = `FROM posts p JOIN users au ON au.id = p.author_id LEFT JOIN profiles ap ON ap.user_id = p.author_id`;

/**
 * The single source of truth for "may this viewer see this post". Applied in SQL
 * to every read path (feeds, profiles, tags, search, single posts, media).
 * Effective visibility is the stricter of the post's and the author's profile setting.
 */
export function visibleTo(viewerId: string): { sql: string; params: Bind[] } {
  return {
    sql: `au.status = 'active'
      AND (p.status = 'visible' OR p.author_id = ?)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = p.author_id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = p.author_id))
      AND (
        p.author_id = ?
        OR (p.visibility = 'public' AND COALESCE(ap.profile_visibility, 'public') = 'public')
        OR (p.visibility IN ('public', 'followers') AND COALESCE(ap.profile_visibility, 'public') <> 'private'
            AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = p.author_id))
        OR (p.visibility = 'community' AND EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = p.community_id AND cm.user_id = ?))
      )`,
    params: [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId],
  };
}

const TAG_RE = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,50})/gu;
const MENTION_RE = /(?:^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})/g;

export function extractTags(body: string): string[] {
  return [...new Set([...body.matchAll(TAG_RE)].map((m) => m[1]!.toLowerCase()))].slice(0, 10);
}

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1]!.toLowerCase()))].slice(0, 10);
}

// Hydration ----------------------------------------------------------------------

async function hydrate(ctx: Ctx, viewer: Viewer, rows: PostRow[]): Promise<PostView[]> {
  if (!rows.length) return [];
  const originalIds = [...new Set(rows.flatMap((r) => (r.repost_of ? [r.repost_of] : [])))];
  const originals = new Map<string, PostRow>();
  if (originalIds.length) {
    const vis = visibleTo(viewer.id);
    const orows = await all<PostRow>(ctx.db, `SELECT ${POST_COLS} ${POST_FROM} WHERE p.id IN (${inList(originalIds.length)}) AND ${vis.sql}`, ...originalIds, ...vis.params);
    for (const o of orows) originals.set(o.id, o);
  }
  const contentRows = [...rows.filter((r) => !r.repost_of), ...originals.values()];
  const ids = contentRows.map((r) => r.id);
  const [media, reactions, bookmarks, reposted, authors] = await Promise.all([
    ids.length
      ? all<{ id: string; post_id: string; kind: "image" | "video"; width: number | null; height: number | null }>(
          ctx.db,
          `SELECT id, post_id, kind, width, height FROM media WHERE post_id IN (${inList(ids.length)}) ORDER BY position`,
          ...ids,
        )
      : [],
    ids.length ? all<{ post_id: string; kind: ReactionKind }>(ctx.db, `SELECT post_id, kind FROM reactions WHERE user_id = ? AND post_id IN (${inList(ids.length)})`, viewer.id, ...ids) : [],
    ids.length ? all<{ post_id: string }>(ctx.db, `SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${inList(ids.length)})`, viewer.id, ...ids) : [],
    ids.length ? all<{ repost_of: string }>(ctx.db, `SELECT repost_of FROM posts WHERE author_id = ? AND repost_of IN (${inList(ids.length)})`, viewer.id, ...ids) : [],
    summariesById(ctx, [...rows, ...originals.values()].map((r) => r.author_id)),
  ]);
  const mediaBy = new Map<string, MediaView[]>();
  for (const m of media) {
    const list = mediaBy.get(m.post_id) ?? [];
    list.push({ id: m.id, kind: m.kind, url: `/api/media/${m.id}`, width: m.width, height: m.height });
    mediaBy.set(m.post_id, list);
  }
  const reactionBy = new Map(reactions.map((r) => [r.post_id, r.kind]));
  const bookmarked = new Set(bookmarks.map((b) => b.post_id));
  const repostedSet = new Set(reposted.map((r) => r.repost_of));

  const view = (r: PostRow): PostView => ({
    id: r.id,
    author: authors.get(r.author_id)!,
    body: r.body,
    visibility: r.visibility,
    media: mediaBy.get(r.id) ?? [],
    createdAt: r.created_at,
    editedAt: r.edited_at,
    counts: { reactions: r.reaction_count, comments: r.comment_count, reposts: r.repost_count },
    viewer: { reaction: reactionBy.get(r.id) ?? null, bookmarked: bookmarked.has(r.id), reposted: repostedSet.has(r.id), isAuthor: r.author_id === viewer.id },
    repostOf: null,
    ...(r.status === "hidden" ? { hidden: true } : {}),
  });

  return rows.map((r) => {
    if (!r.repost_of) return view(r);
    const o = originals.get(r.repost_of);
    return {
      ...view(r),
      repostOf: o ? view(o) : null,
      unavailable: !o,
    };
  });
}

async function pageOf(ctx: Ctx, viewer: Viewer, where: string, params: Bind[], cursor: string | null, limit = 20): Promise<Page<PostView>> {
  const vis = visibleTo(viewer.id);
  const c = decodeCursor(cursor);
  const cursorSql = c ? `AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))` : "";
  const cursorParams: Bind[] = c ? [c.createdAt, c.createdAt, c.id] : [];
  const rows = await all<PostRow>(
    ctx.db,
    `SELECT ${POST_COLS} ${POST_FROM} WHERE ${vis.sql} AND (${where}) ${cursorSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    ...vis.params,
    ...params,
    ...cursorParams,
    limit + 1,
  );
  const more = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  return { items: await hydrate(ctx, viewer, pageRows), nextCursor: more && last ? encodeCursor(last.created_at, last.id) : null };
}

// Feeds --------------------------------------------------------------------------

export async function feed(ctx: Ctx, viewer: Viewer, tab: "home" | "following" | "discover", cursor: string | null): Promise<Page<PostView>> {
  if (tab === "discover") return discover(ctx, viewer, cursor);
  if (tab === "following") return pageOf(ctx, viewer, `p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)`, [viewer.id], cursor);
  return pageOf(
    ctx,
    viewer,
    `p.author_id = ? OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
       OR (p.visibility = 'community' AND p.community_id IN (SELECT community_id FROM community_members WHERE user_id = ?))`,
    [viewer.id, viewer.id, viewer.id],
    cursor,
  );
}

/**
 * Recommendation feed — deliberately simple and explainable: public original
 * posts from the last 7 days by accounts you don't follow, ranked by engagement
 * with time decay: (1 + 2·reactions + 3·comments + 4·reposts) / (age_h + 2)².
 */
async function discover(ctx: Ctx, viewer: Viewer, cursor: string | null): Promise<Page<PostView>> {
  const offset = cursor && /^o\d{1,4}$/.test(cursor) ? Number(cursor.slice(1)) : 0;
  const limit = 20;
  const now = ctx.now();
  const vis = visibleTo(viewer.id);
  const rows = await all<PostRow>(
    ctx.db,
    `SELECT ${POST_COLS} ${POST_FROM}
      WHERE ${vis.sql} AND p.status = 'visible' AND p.visibility = 'public' AND p.repost_of IS NULL AND p.created_at > ?
        AND p.author_id <> ? AND p.author_id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)
      ORDER BY (1.0 + 2 * p.reaction_count + 3 * p.comment_count + 4 * p.repost_count)
               / ((((? - p.created_at) / 3600000.0) + 2) * (((? - p.created_at) / 3600000.0) + 2)) DESC, p.created_at DESC
      LIMIT ? OFFSET ?`,
    ...vis.params,
    now - 7 * 86_400_000,
    viewer.id,
    viewer.id,
    now,
    now,
    limit + 1,
    offset,
  );
  const more = rows.length > limit;
  return { items: await hydrate(ctx, viewer, rows.slice(0, limit)), nextCursor: more ? `o${offset + limit}` : null };
}

export async function userPosts(ctx: Ctx, viewer: Viewer, username: string, kind: "posts" | "media", cursor: string | null): Promise<Page<PostView>> {
  const u = await findByUsername(ctx, username);
  if (!u || u.status !== "active") throw notFound("User");
  if (!(await canViewProfileContent(ctx, viewer.id, u.id))) return { items: [], nextCursor: null };
  const where = kind === "media" ? `p.author_id = ? AND p.repost_of IS NULL AND EXISTS (SELECT 1 FROM media m WHERE m.post_id = p.id)` : `p.author_id = ?`;
  return pageOf(ctx, viewer, where, [u.id], cursor);
}

export async function tagPosts(ctx: Ctx, viewer: Viewer, tag: string, cursor: string | null): Promise<Page<PostView>> {
  return pageOf(ctx, viewer, `p.id IN (SELECT post_id FROM post_tags WHERE tag = ?)`, [tag.toLowerCase()], cursor);
}

export async function bookmarksPage(ctx: Ctx, viewer: Viewer, cursor: string | null): Promise<Page<PostView>> {
  return pageOf(ctx, viewer, `p.id IN (SELECT post_id FROM bookmarks WHERE user_id = ?)`, [viewer.id], cursor);
}

export async function searchPosts(ctx: Ctx, viewer: Viewer, q: string, limit = 20): Promise<PostView[]> {
  const page = await pageOf(ctx, viewer, `p.repost_of IS NULL AND p.body LIKE ? ESCAPE '\\'`, [likePattern(q)], null, limit);
  return page.items;
}

export async function trending(ctx: Ctx, limit = 10): Promise<{ tag: string; count: number }[]> {
  return all<{ tag: string; count: number }>(
    ctx.db,
    `SELECT t.tag, COUNT(*) AS count FROM post_tags t JOIN posts p ON p.id = t.post_id JOIN users au ON au.id = p.author_id LEFT JOIN profiles ap ON ap.user_id = p.author_id
      WHERE t.created_at > ? AND p.status = 'visible' AND p.visibility = 'public' AND COALESCE(ap.profile_visibility, 'public') = 'public' AND au.status = 'active'
      GROUP BY t.tag ORDER BY count DESC, MAX(t.created_at) DESC LIMIT ?`,
    ctx.now() - 3 * 86_400_000,
    limit,
  );
}

// Single posts -------------------------------------------------------------------

async function visibleRow(ctx: Ctx, viewer: Viewer, id: string): Promise<PostRow> {
  const vis = visibleTo(viewer.id);
  const row = await one<PostRow>(ctx.db, `SELECT ${POST_COLS} ${POST_FROM} WHERE p.id = ? AND ${vis.sql}`, id, ...vis.params);
  if (!row) throw notFound("Post");
  return row;
}

export async function getPost(ctx: Ctx, viewer: Viewer, id: string): Promise<PostView> {
  const [v] = await hydrate(ctx, viewer, [await visibleRow(ctx, viewer, id)]);
  return v!;
}

/** May the viewer see this post? Used to authorise media downloads. */
export async function canViewPost(ctx: Ctx, viewerId: string, postId: string): Promise<boolean> {
  const vis = visibleTo(viewerId);
  return !!(await one(ctx.db, `SELECT 1 ${POST_FROM} WHERE p.id = ? AND ${vis.sql}`, postId, ...vis.params));
}

async function notifyMentions(ctx: Ctx, viewer: Viewer, body: string, postId: string, what: "post" | "comment") {
  const names = extractMentions(body).filter((n) => n !== viewer.username.toLowerCase());
  if (!names.length) return;
  const users = await all<{ id: string; allow_mentions: number }>(
    ctx.db,
    `SELECT u.id, COALESCE(pr.allow_mentions, 1) AS allow_mentions FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id WHERE u.username IN (${inList(names.length)}) AND u.status = 'active'`,
    ...names,
  );
  for (const u of users) {
    if (!u.allow_mentions) continue;
    // Only notify people who can actually see the post.
    if (!(await canViewPost(ctx, u.id, postId))) continue;
    await notify(ctx, u.id, { kind: "mention", actorId: viewer.id, title: `${viewer.displayName} mentioned you in a ${what}`, body: body.slice(0, 140), link: `/social/post/${postId}` });
  }
}

export async function createPost(ctx: Ctx, viewer: Viewer, input: z.infer<typeof createPostSchema>): Promise<PostView> {
  await enforce(ctx, LIMIT.post, viewer.id);
  let visibility: PostView["visibility"] = input.visibility;
  let communityId: string | null = null;
  if (input.communityId) {
    const m = await one(ctx.db, `SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?`, input.communityId, viewer.id);
    if (!m) throw forbidden("Join the community before posting to it.");
    visibility = "community";
    communityId = input.communityId;
  }
  const mediaIds = [...new Set(input.mediaIds)];
  if (mediaIds.length) {
    const owned = await all<{ id: string }>(
      ctx.db,
      `SELECT id FROM media WHERE id IN (${inList(mediaIds.length)}) AND owner_id = ? AND post_id IS NULL`,
      ...mediaIds,
      viewer.id,
    );
    if (owned.length !== mediaIds.length) throw badRequest("One of the attachments is missing or already used. Upload it again.");
  }
  const id = newId("pst");
  const now = ctx.now();
  await ctx.db.batch([
    stmt(ctx.db, `INSERT INTO posts (id, author_id, body, visibility, community_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, viewer.id, input.body, visibility, communityId, now),
    ...mediaIds.map((m, i) => stmt(ctx.db, `UPDATE media SET post_id = ?, position = ? WHERE id = ? AND owner_id = ?`, id, i, m, viewer.id)),
    ...extractTags(input.body).map((t) => stmt(ctx.db, `INSERT OR IGNORE INTO post_tags (tag, post_id, created_at) VALUES (?, ?, ?)`, t, id, now)),
  ]);
  await notifyMentions(ctx, viewer, input.body, id, "post");
  return getPost(ctx, viewer, id);
}

export async function editPost(ctx: Ctx, viewer: Viewer, id: string, body: string): Promise<PostView> {
  const row = await one<PostRow>(ctx.db, `SELECT ${POST_COLS} FROM posts p WHERE p.id = ?`, id);
  if (!row || row.author_id !== viewer.id) throw notFound("Post");
  if (row.repost_of) throw badRequest("Reposts can't be edited.");
  const now = ctx.now();
  await ctx.db.batch([
    stmt(ctx.db, `UPDATE posts SET body = ?, edited_at = ? WHERE id = ?`, body, now, id),
    stmt(ctx.db, `DELETE FROM post_tags WHERE post_id = ?`, id),
    ...extractTags(body).map((t) => stmt(ctx.db, `INSERT OR IGNORE INTO post_tags (tag, post_id, created_at) VALUES (?, ?, ?)`, t, id, row.created_at)),
  ]);
  return getPost(ctx, viewer, id);
}

export async function deletePost(ctx: Ctx, viewer: Viewer, id: string): Promise<void> {
  const row = await one<PostRow>(ctx.db, `SELECT ${POST_COLS} FROM posts p WHERE p.id = ?`, id);
  if (!row || row.author_id !== viewer.id) throw notFound("Post");
  const keys = await all<{ r2_key: string }>(ctx.db, `SELECT r2_key FROM media WHERE post_id = ?`, id);
  await ctx.db.batch([
    ...(row.repost_of ? [stmt(ctx.db, `UPDATE posts SET repost_count = MAX(0, repost_count - 1) WHERE id = ?`, row.repost_of)] : []),
    stmt(ctx.db, `DELETE FROM posts WHERE id = ?`, id),
  ]);
  deleteObjects(ctx, keys.map((k) => k.r2_key));
}

// Engagement ---------------------------------------------------------------------

export async function react(ctx: Ctx, viewer: Viewer, id: string, kind: ReactionKind): Promise<PostView> {
  const row = await visibleRow(ctx, viewer, id);
  if (row.repost_of) throw badRequest("React to the original post.");
  const existing = await one<{ kind: string }>(ctx.db, `SELECT kind FROM reactions WHERE post_id = ? AND user_id = ?`, id, viewer.id);
  if (existing) {
    await run(ctx.db, `UPDATE reactions SET kind = ? WHERE post_id = ? AND user_id = ?`, kind, id, viewer.id);
  } else {
    await ctx.db.batch([
      stmt(ctx.db, `INSERT INTO reactions (post_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)`, id, viewer.id, kind, ctx.now()),
      stmt(ctx.db, `UPDATE posts SET reaction_count = reaction_count + 1 WHERE id = ?`, id),
    ]);
    await notify(ctx, row.author_id, { kind: "reaction", actorId: viewer.id, title: `${viewer.displayName} reacted to your post`, body: row.body.slice(0, 140), link: `/social/post/${id}` });
  }
  return getPost(ctx, viewer, id);
}

export async function unreact(ctx: Ctx, viewer: Viewer, id: string): Promise<PostView> {
  await visibleRow(ctx, viewer, id);
  const n = await run(ctx.db, `DELETE FROM reactions WHERE post_id = ? AND user_id = ?`, id, viewer.id);
  if (n) await run(ctx.db, `UPDATE posts SET reaction_count = MAX(0, reaction_count - 1) WHERE id = ?`, id);
  return getPost(ctx, viewer, id);
}

export async function repost(ctx: Ctx, viewer: Viewer, id: string): Promise<PostView> {
  let row = await visibleRow(ctx, viewer, id);
  if (row.repost_of) row = await visibleRow(ctx, viewer, row.repost_of);
  const profile = await one<{ profile_visibility: string }>(ctx.db, `SELECT profile_visibility FROM profiles WHERE user_id = ?`, row.author_id);
  if (row.visibility !== "public" || (profile?.profile_visibility ?? "public") !== "public") throw badRequest("Only public posts can be reposted.");
  if (row.author_id === viewer.id) throw badRequest("You can't repost your own post.");
  await enforce(ctx, LIMIT.post, viewer.id);
  const rid = newId("pst");
  try {
    await ctx.db.batch([
      stmt(ctx.db, `INSERT INTO posts (id, author_id, body, visibility, repost_of, created_at) VALUES (?, ?, '', 'public', ?, ?)`, rid, viewer.id, row.id, ctx.now()),
      stmt(ctx.db, `UPDATE posts SET repost_count = repost_count + 1 WHERE id = ?`, row.id),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test((err as Error).message)) return getPost(ctx, viewer, row.id);
    throw err;
  }
  await notify(ctx, row.author_id, { kind: "repost", actorId: viewer.id, title: `${viewer.displayName} reposted your post`, body: row.body.slice(0, 140), link: `/social/post/${row.id}` });
  return getPost(ctx, viewer, row.id);
}

export async function unrepost(ctx: Ctx, viewer: Viewer, originalId: string): Promise<void> {
  const n = await run(ctx.db, `DELETE FROM posts WHERE author_id = ? AND repost_of = ?`, viewer.id, originalId);
  if (n) await run(ctx.db, `UPDATE posts SET repost_count = MAX(0, repost_count - 1) WHERE id = ?`, originalId);
}

export async function bookmark(ctx: Ctx, viewer: Viewer, id: string, on: boolean): Promise<void> {
  if (on) {
    await visibleRow(ctx, viewer, id);
    await run(ctx.db, `INSERT OR IGNORE INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)`, viewer.id, id, ctx.now());
  } else {
    await run(ctx.db, `DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?`, viewer.id, id);
  }
}

// Comments -----------------------------------------------------------------------

export async function listComments(ctx: Ctx, viewer: Viewer, postId: string): Promise<CommentView[]> {
  const post = await visibleRow(ctx, viewer, postId);
  const rows = await all<{ id: string; post_id: string; parent_id: string | null; author_id: string; body: string; deleted: number; created_at: number }>(
    ctx.db,
    `SELECT c.id, c.post_id, c.parent_id, c.author_id, c.body, c.deleted, c.created_at FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ? AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = c.author_id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = c.author_id))
      ORDER BY c.created_at ASC LIMIT 500`,
    postId,
    viewer.id,
    viewer.id,
  );
  const authors = await summariesById(ctx, rows.map((r) => r.author_id));
  const isMod = platformCan(viewer.role, "moderation.hide_content");
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    parentId: r.parent_id,
    author: authors.get(r.author_id)!,
    body: r.deleted ? "" : r.body,
    createdAt: r.created_at,
    deleted: !!r.deleted,
    canDelete: !r.deleted && (r.author_id === viewer.id || post.author_id === viewer.id || isMod),
  }));
}

export async function addComment(ctx: Ctx, viewer: Viewer, postId: string, body: string, parentId?: string): Promise<CommentView> {
  await enforce(ctx, LIMIT.comment, viewer.id);
  const post = await visibleRow(ctx, viewer, postId);
  if (post.repost_of) throw badRequest("Comment on the original post.");
  let parent: { id: string; author_id: string; parent_id: string | null } | null = null;
  if (parentId) {
    parent = await one(ctx.db, `SELECT id, author_id, parent_id FROM comments WHERE id = ? AND post_id = ? AND deleted = 0`, parentId, postId);
    if (!parent) throw notFound("Comment");
  }
  // One level of nesting: replies to replies attach to the top-level comment.
  const threadParent = parent ? (parent.parent_id ?? parent.id) : null;
  const id = newId("cmt");
  await ctx.db.batch([
    stmt(ctx.db, `INSERT INTO comments (id, post_id, author_id, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, postId, viewer.id, threadParent, body, ctx.now()),
    stmt(ctx.db, `UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?`, postId),
  ]);
  const link = `/social/post/${postId}#${id}`;
  await notify(ctx, post.author_id, { kind: "comment", actorId: viewer.id, title: `${viewer.displayName} commented on your post`, body: body.slice(0, 140), link });
  if (parent && parent.author_id !== post.author_id) {
    await notify(ctx, parent.author_id, { kind: "reply", actorId: viewer.id, title: `${viewer.displayName} replied to your comment`, body: body.slice(0, 140), link });
  }
  await notifyMentions(ctx, viewer, body, postId, "comment");
  const author = (await summariesById(ctx, [viewer.id])).get(viewer.id)!;
  return { id, postId, parentId: threadParent, author, body, createdAt: ctx.now(), deleted: false, canDelete: true };
}

export async function deleteComment(ctx: Ctx, viewer: Viewer, id: string): Promise<void> {
  const c = await one<{ id: string; post_id: string; author_id: string; deleted: number; post_author: string }>(
    ctx.db,
    `SELECT c.id, c.post_id, c.author_id, c.deleted, p.author_id AS post_author FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?`,
    id,
  );
  if (!c || c.deleted) throw notFound("Comment");
  const allowed = c.author_id === viewer.id || c.post_author === viewer.id || platformCan(viewer.role, "moderation.hide_content");
  if (!allowed) throw forbidden();
  await ctx.db.batch([
    stmt(ctx.db, `UPDATE comments SET deleted = 1, body = '' WHERE id = ?`, id),
    stmt(ctx.db, `UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?`, c.post_id),
  ]);
}

/** Recomputes cached counters (used after account deletion removes rows by cascade). */
export async function recount(ctx: Ctx, postIds: string[]): Promise<void> {
  for (const id of new Set(postIds)) {
    await run(
      ctx.db,
      `UPDATE posts SET
         reaction_count = (SELECT COUNT(*) FROM reactions WHERE post_id = ?),
         comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND deleted = 0),
         repost_count = (SELECT COUNT(*) FROM posts r WHERE r.repost_of = ?)
       WHERE id = ?`,
      id,
      id,
      id,
      id,
    );
  }
}
