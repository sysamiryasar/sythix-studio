import type { z } from "zod";
import type { Ctx } from "../env";
import type { ChannelView, CommunitySummary, ConversationView, MessageView, UserSummary } from "@shared/types";
import type { channelSchema, communitySchema, communityUpdateSchema } from "@shared/schemas";
import { communityCan, communityRank, outranks, type CommunityRole, type CommunityPermission } from "@shared/permissions";
import { all, inList, one, run, stmt, type Bind } from "../lib/db";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId, randomToken } from "../lib/ids";
import { enforce, LIMIT } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import { publish } from "../realtime/publish";
import { notify } from "./notifications";
import { summariesById, findByUsername, isBlockedEither, isFollowing } from "./users";
import type { Viewer } from "./social";

interface CommunityRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  owner_id: string;
  status: string;
}

// Communities --------------------------------------------------------------------

async function memberRole(ctx: Ctx, communityId: string, userId: string): Promise<CommunityRole | null> {
  return (await one<{ role: CommunityRole }>(ctx.db, `SELECT role FROM community_members WHERE community_id = ? AND user_id = ?`, communityId, userId))?.role ?? null;
}

async function loadCommunity(ctx: Ctx, viewer: Viewer, slug: string): Promise<{ c: CommunityRow; role: CommunityRole | null }> {
  const c = await one<CommunityRow>(ctx.db, `SELECT id, slug, name, description, visibility, owner_id, status FROM communities WHERE slug = ?`, slug);
  if (!c) throw notFound("Community");
  const role = await memberRole(ctx, c.id, viewer.id);
  const banned = await one(ctx.db, `SELECT 1 FROM community_bans WHERE community_id = ? AND user_id = ?`, c.id, viewer.id);
  // Private, hidden and banned-from communities are indistinguishable from missing ones.
  if (banned || (!role && (c.visibility === "private" || c.status !== "active"))) throw notFound("Community");
  return { c, role };
}

function require(role: CommunityRole | null, perm: CommunityPermission) {
  if (!communityCan(role, perm)) throw forbidden();
}

async function summaries(ctx: Ctx, viewerId: string, rows: (CommunityRow & { member_count: number })[]): Promise<CommunitySummary[]> {
  if (!rows.length) return [];
  const roles = await all<{ community_id: string; role: CommunityRole }>(
    ctx.db,
    `SELECT community_id, role FROM community_members WHERE user_id = ? AND community_id IN (${inList(rows.length)})`,
    viewerId,
    ...rows.map((r) => r.id),
  );
  const roleBy = new Map(roles.map((r) => [r.community_id, r.role]));
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, visibility: r.visibility, memberCount: r.member_count, myRole: roleBy.get(r.id) ?? null }));
}

const COMMUNITY_COLS = `c.id, c.slug, c.name, c.description, c.visibility, c.owner_id, c.status, (SELECT COUNT(*) FROM community_members x WHERE x.community_id = c.id) AS member_count`;

export async function myCommunities(ctx: Ctx, viewer: Viewer): Promise<CommunitySummary[]> {
  const rows = await all<CommunityRow & { member_count: number }>(
    ctx.db,
    `SELECT ${COMMUNITY_COLS} FROM communities c JOIN community_members m ON m.community_id = c.id AND m.user_id = ? ORDER BY m.joined_at`,
    viewer.id,
  );
  return summaries(ctx, viewer.id, rows);
}

export async function discoverCommunities(ctx: Ctx, viewer: Viewer, q?: string): Promise<CommunitySummary[]> {
  const params: Bind[] = [];
  let filter = "";
  if (q) {
    filter = `AND (c.name LIKE ? ESCAPE '\\' OR c.slug LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')`;
    const like = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    params.push(like, like, like);
  }
  const rows = await all<CommunityRow & { member_count: number }>(
    ctx.db,
    `SELECT ${COMMUNITY_COLS} FROM communities c
      WHERE c.status = 'active' AND (c.visibility = 'public' OR EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = ?)) ${filter}
        AND NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.community_id = c.id AND b.user_id = ?)
      ORDER BY member_count DESC, c.created_at DESC LIMIT 30`,
    viewer.id,
    ...params,
    viewer.id,
  );
  return summaries(ctx, viewer.id, rows);
}

export async function createCommunity(ctx: Ctx, viewer: Viewer, input: z.infer<typeof communitySchema>): Promise<CommunitySummary> {
  await enforce(ctx, LIMIT.community, viewer.id);
  if (await one(ctx.db, `SELECT 1 FROM communities WHERE slug = ?`, input.slug)) throw conflict("That community address is taken.");
  const id = newId("com");
  const now = ctx.now();
  await ctx.db.batch([
    stmt(ctx.db, `INSERT INTO communities (id, slug, name, description, visibility, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, input.slug, input.name, input.description, input.visibility, viewer.id, now),
    stmt(ctx.db, `INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`, id, viewer.id, now),
    stmt(ctx.db, `INSERT INTO channels (id, community_id, name, kind, topic, position, created_at) VALUES (?, ?, 'general', 'text', 'Talk about anything.', 0, ?)`, newId("chn"), id, now),
    stmt(ctx.db, `INSERT INTO channels (id, community_id, name, kind, topic, position, created_at) VALUES (?, ?, 'announcements', 'announcement', 'Updates from the team.', 1, ?)`, newId("chn"), id, now),
  ]);
  await audit(ctx, { actorId: viewer.id, action: "community.created", targetType: "community", targetId: id });
  return { id, slug: input.slug, name: input.name, description: input.description, visibility: input.visibility, memberCount: 1, myRole: "owner" };
}

export async function getCommunity(ctx: Ctx, viewer: Viewer, slug: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  const [summary] = await summaries(ctx, viewer.id, [{ ...c, member_count: (await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM community_members WHERE community_id = ?`, c.id))?.n ?? 0 }]);
  return { community: summary!, channels: role ? await channelsFor(ctx, viewer.id, c.id, role) : [], isOwner: c.owner_id === viewer.id };
}

export async function updateCommunity(ctx: Ctx, viewer: Viewer, slug: string, input: z.infer<typeof communityUpdateSchema>) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "community.manage");
  await run(
    ctx.db,
    `UPDATE communities SET name = COALESCE(?, name), description = COALESCE(?, description), visibility = COALESCE(?, visibility) WHERE id = ?`,
    input.name ?? null,
    input.description ?? null,
    input.visibility ?? null,
    c.id,
  );
  await audit(ctx, { actorId: viewer.id, action: "community.updated", targetType: "community", targetId: c.id, meta: input });
}

export async function deleteCommunity(ctx: Ctx, viewer: Viewer, slug: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "community.delete");
  await run(ctx.db, `DELETE FROM communities WHERE id = ?`, c.id);
  await audit(ctx, { actorId: viewer.id, action: "community.deleted", targetType: "community", targetId: c.id });
}

export async function join(ctx: Ctx, viewer: Viewer, slug: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  if (role) return;
  if (c.visibility !== "public") throw forbidden("This community is invite-only.");
  await run(ctx.db, `INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`, c.id, viewer.id, ctx.now());
}

export async function leave(ctx: Ctx, viewer: Viewer, slug: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  if (role === "owner") throw badRequest("Owners can't leave. Transfer ownership or delete the community.");
  await run(ctx.db, `DELETE FROM community_members WHERE community_id = ? AND user_id = ?`, c.id, viewer.id);
}

export async function createInvite(ctx: Ctx, viewer: Viewer, slug: string, opts: { maxUses?: number; expiresInHours?: number }) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "invite.create");
  const code = randomToken(8).replace(/[-_]/g, "x").slice(0, 10);
  const expiresAt = opts.expiresInHours ? ctx.now() + opts.expiresInHours * 3_600_000 : null;
  await run(ctx.db, `INSERT INTO community_invites (code, community_id, created_by, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`, code, c.id, viewer.id, opts.maxUses ?? null, expiresAt, ctx.now());
  return { code, url: `/invite/${code}`, expiresAt, maxUses: opts.maxUses ?? null };
}

export async function previewInvite(ctx: Ctx, viewer: Viewer, code: string) {
  const inv = await one<{ community_id: string; max_uses: number | null; uses: number; expires_at: number | null }>(ctx.db, `SELECT community_id, max_uses, uses, expires_at FROM community_invites WHERE code = ?`, code);
  if (!inv || (inv.expires_at && inv.expires_at < ctx.now()) || (inv.max_uses && inv.uses >= inv.max_uses)) throw notFound("Invite");
  const c = await one<CommunityRow & { member_count: number }>(ctx.db, `SELECT ${COMMUNITY_COLS} FROM communities c WHERE c.id = ? AND c.status = 'active'`, inv.community_id);
  if (!c) throw notFound("Invite");
  return (await summaries(ctx, viewer.id, [c]))[0]!;
}

export async function acceptInvite(ctx: Ctx, viewer: Viewer, code: string) {
  const summary = await previewInvite(ctx, viewer, code);
  if (await one(ctx.db, `SELECT 1 FROM community_bans WHERE community_id = ? AND user_id = ?`, summary.id, viewer.id)) throw forbidden("You are banned from this community.");
  if (!summary.myRole) {
    await ctx.db.batch([
      stmt(ctx.db, `INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`, summary.id, viewer.id, ctx.now()),
      stmt(ctx.db, `UPDATE community_invites SET uses = uses + 1 WHERE code = ?`, code),
    ]);
  }
  return summary;
}

export async function listMembers(ctx: Ctx, viewer: Viewer, slug: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "community.view");
  const rows = await all<{ user_id: string; role: CommunityRole; joined_at: number }>(
    ctx.db,
    `SELECT user_id, role, joined_at FROM community_members WHERE community_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, joined_at LIMIT 500`,
    c.id,
  );
  const users = await summariesById(ctx, rows.map((r) => r.user_id));
  return rows.map((r) => ({ user: users.get(r.user_id)!, role: r.role, joinedAt: r.joined_at }));
}

export async function moderateMember(ctx: Ctx, viewer: Viewer, slug: string, userId: string, action: { type: "role"; role: CommunityRole } | { type: "kick" } | { type: "ban"; reason?: string }) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  const targetRole = await memberRole(ctx, c.id, userId);
  if (!role || userId === viewer.id) throw forbidden();
  if (action.type === "ban") {
    require(role, "member.ban");
    if (targetRole && !outranks(role, targetRole)) throw forbidden("You can only act on members ranked below you.");
    await ctx.db.batch([
      stmt(ctx.db, `DELETE FROM community_members WHERE community_id = ? AND user_id = ?`, c.id, userId),
      stmt(ctx.db, `INSERT OR REPLACE INTO community_bans (community_id, user_id, banned_by, reason, created_at) VALUES (?, ?, ?, ?, ?)`, c.id, userId, viewer.id, action.reason ?? "", ctx.now()),
    ]);
  } else {
    if (!targetRole) throw notFound("Member");
    if (!outranks(role, targetRole)) throw forbidden("You can only act on members ranked below you.");
    if (action.type === "kick") {
      require(role, "member.kick");
      await run(ctx.db, `DELETE FROM community_members WHERE community_id = ? AND user_id = ?`, c.id, userId);
    } else {
      require(role, "member.set_role");
      if (action.role === "owner" || communityRank(action.role) >= communityRank(role)) throw forbidden("You can only grant roles below your own.");
      await run(ctx.db, `UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?`, action.role, c.id, userId);
    }
  }
  await audit(ctx, { actorId: viewer.id, action: `community.member_${action.type}`, targetType: "user", targetId: userId, meta: { community: c.id, ...action } });
}

export async function unban(ctx: Ctx, viewer: Viewer, slug: string, userId: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "member.ban");
  await run(ctx.db, `DELETE FROM community_bans WHERE community_id = ? AND user_id = ?`, c.id, userId);
}

export async function listBans(ctx: Ctx, viewer: Viewer, slug: string) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "member.ban");
  const rows = await all<{ user_id: string; reason: string; created_at: number }>(ctx.db, `SELECT user_id, reason, created_at FROM community_bans WHERE community_id = ? ORDER BY created_at DESC`, c.id);
  const users = await summariesById(ctx, rows.map((r) => r.user_id));
  return rows.map((r) => ({ user: users.get(r.user_id)!, reason: r.reason, createdAt: r.created_at }));
}

// Channels -----------------------------------------------------------------------

interface ChannelRow {
  id: string;
  community_id: string;
  name: string;
  kind: ChannelView["kind"];
  topic: string;
  min_role: CommunityRole;
}

function canPost(role: CommunityRole, ch: ChannelRow): boolean {
  if (ch.kind === "voice") return false;
  if (ch.kind === "announcement") return communityRank(role) >= communityRank("moderator");
  return communityCan(role, "message.send");
}

async function channelsFor(ctx: Ctx, userId: string, communityId: string, role: CommunityRole): Promise<ChannelView[]> {
  const rows = await all<ChannelRow & { last_at: number | null; read_at: number | null }>(
    ctx.db,
    `SELECT ch.id, ch.community_id, ch.name, ch.kind, ch.topic, ch.min_role,
            (SELECT MAX(created_at) FROM messages m WHERE m.channel_id = ch.id AND m.deleted_at IS NULL) AS last_at,
            (SELECT last_read_at FROM read_states r WHERE r.user_id = ? AND r.target_id = ch.id) AS read_at
       FROM channels ch WHERE ch.community_id = ? ORDER BY ch.position, ch.created_at`,
    userId,
    communityId,
  );
  return rows
    .filter((r) => communityRank(role) >= communityRank(r.min_role))
    .map((r) => ({ id: r.id, communityId: r.community_id, name: r.name, kind: r.kind, topic: r.topic, minRole: r.min_role, canPost: canPost(role, r), unread: !!r.last_at && (r.read_at ?? 0) < r.last_at }));
}

export async function createChannel(ctx: Ctx, viewer: Viewer, slug: string, input: z.infer<typeof channelSchema>) {
  const { c, role } = await loadCommunity(ctx, viewer, slug);
  require(role, "channel.manage");
  if (await one(ctx.db, `SELECT 1 FROM channels WHERE community_id = ? AND name = ?`, c.id, input.name)) throw conflict("A channel with that name exists.");
  const count = (await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM channels WHERE community_id = ?`, c.id))?.n ?? 0;
  if (count >= 50) throw badRequest("Communities can have at most 50 channels.");
  const id = newId("chn");
  await run(ctx.db, `INSERT INTO channels (id, community_id, name, kind, topic, min_role, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, c.id, input.name, input.kind, input.topic, input.minRole, count, ctx.now());
  return id;
}

export async function updateChannel(ctx: Ctx, viewer: Viewer, channelId: string, input: Partial<z.infer<typeof channelSchema>>) {
  const { ch, role } = await loadChannel(ctx, viewer, channelId);
  require(role, "channel.manage");
  await run(ctx.db, `UPDATE channels SET name = COALESCE(?, name), topic = COALESCE(?, topic), min_role = COALESCE(?, min_role) WHERE id = ?`, input.name ?? null, input.topic ?? null, input.minRole ?? null, ch.id);
}

export async function deleteChannel(ctx: Ctx, viewer: Viewer, channelId: string) {
  const { ch, role } = await loadChannel(ctx, viewer, channelId);
  require(role, "channel.manage");
  await run(ctx.db, `DELETE FROM channels WHERE id = ?`, ch.id);
  await audit(ctx, { actorId: viewer.id, action: "channel.deleted", targetType: "channel", targetId: ch.id });
}

async function loadChannel(ctx: Ctx, viewer: Viewer, channelId: string): Promise<{ ch: ChannelRow; role: CommunityRole }> {
  const ch = await one<ChannelRow>(ctx.db, `SELECT id, community_id, name, kind, topic, min_role FROM channels WHERE id = ?`, channelId);
  if (!ch) throw notFound("Channel");
  const role = await memberRole(ctx, ch.community_id, viewer.id);
  if (!role || communityRank(role) < communityRank(ch.min_role)) throw notFound("Channel");
  return { ch, role };
}

// Conversations ------------------------------------------------------------------

async function assertCanMessage(ctx: Ctx, sender: Viewer, target: { id: string; username: string }) {
  if (await isBlockedEither(ctx, sender.id, target.id)) throw notFound("User");
  const p = await one<{ dm_policy: string }>(ctx.db, `SELECT dm_policy FROM profiles WHERE user_id = ?`, target.id);
  const policy = p?.dm_policy ?? "followers";
  if (policy === "nobody") throw forbidden(`${target.username} isn't accepting messages.`);
  if (policy === "followers" && !(await isFollowing(ctx, target.id, sender.id))) throw forbidden(`${target.username} only accepts messages from people they follow.`);
}

export async function createConversation(ctx: Ctx, viewer: Viewer, usernames: string[], title?: string): Promise<{ id: string }> {
  const names = [...new Set(usernames.map((u) => u.toLowerCase()))].filter((u) => u !== viewer.username.toLowerCase());
  if (!names.length) throw badRequest("Choose who to message.");
  const targets: { id: string; username: string }[] = [];
  for (const n of names) {
    const u = await findByUsername(ctx, n);
    if (!u || u.status !== "active") throw notFound(`User @${n}`);
    await assertCanMessage(ctx, viewer, u);
    targets.push(u);
  }
  const now = ctx.now();
  if (targets.length === 1) {
    const dmKey = [viewer.id, targets[0]!.id].sort().join(":");
    const existing = await one<{ id: string }>(ctx.db, `SELECT id FROM conversations WHERE dm_key = ?`, dmKey);
    if (existing) return existing;
    const id = newId("cnv");
    await ctx.db.batch([
      stmt(ctx.db, `INSERT INTO conversations (id, kind, dm_key, created_by, created_at) VALUES (?, 'dm', ?, ?, ?)`, id, dmKey, viewer.id, now),
      stmt(ctx.db, `INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`, id, viewer.id, now),
      stmt(ctx.db, `INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`, id, targets[0]!.id, now),
    ]);
    return { id };
  }
  const id = newId("cnv");
  await ctx.db.batch([
    stmt(ctx.db, `INSERT INTO conversations (id, kind, title, created_by, created_at) VALUES (?, 'group', ?, ?, ?)`, id, title ?? "", viewer.id, now),
    ...[viewer, ...targets].map((u) => stmt(ctx.db, `INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`, id, u.id, now)),
  ]);
  return { id };
}

async function loadConversation(ctx: Ctx, viewer: Viewer, id: string) {
  const c = await one<{ id: string; kind: "dm" | "group"; title: string; last_message_at: number | null }>(
    ctx.db,
    `SELECT c.id, c.kind, c.title, c.last_message_at FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ? WHERE c.id = ?`,
    viewer.id,
    id,
  );
  if (!c) throw notFound("Conversation");
  return c;
}

export async function listConversations(ctx: Ctx, viewer: Viewer): Promise<ConversationView[]> {
  const rows = await all<{ id: string; kind: "dm" | "group"; title: string; last_message_at: number | null; read_at: number | null }>(
    ctx.db,
    `SELECT c.id, c.kind, c.title, c.last_message_at, (SELECT last_read_at FROM read_states r WHERE r.user_id = ? AND r.target_id = c.id) AS read_at
       FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`,
    viewer.id,
    viewer.id,
  );
  return Promise.all(rows.map(async (r) => conversationView(ctx, viewer, r)));
}

async function conversationView(ctx: Ctx, viewer: Viewer, r: { id: string; kind: "dm" | "group"; title: string; last_message_at: number | null; read_at?: number | null }): Promise<ConversationView> {
  const memberIds = (await all<{ user_id: string }>(ctx.db, `SELECT user_id FROM conversation_members WHERE conversation_id = ?`, r.id)).map((m) => m.user_id);
  const users = await summariesById(ctx, memberIds);
  const members = memberIds.map((id) => users.get(id)).filter((u): u is UserSummary => !!u);
  const others = members.filter((m) => m.id !== viewer.id);
  return {
    id: r.id,
    kind: r.kind,
    title: r.title || others.map((o) => o.displayName).join(", ") || "Just you",
    members,
    lastMessageAt: r.last_message_at,
    unread: !!r.last_message_at && (r.read_at ?? 0) < r.last_message_at,
  };
}

export async function getConversation(ctx: Ctx, viewer: Viewer, id: string) {
  return conversationView(ctx, viewer, await loadConversation(ctx, viewer, id));
}

export async function leaveConversation(ctx: Ctx, viewer: Viewer, id: string) {
  const c = await loadConversation(ctx, viewer, id);
  if (c.kind === "dm") throw badRequest("Direct messages can't be left; block the person instead.");
  await run(ctx.db, `DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`, id, viewer.id);
}

// Messages (shared by channels and conversations) -----------------------------------

export type Target = { kind: "channel"; id: string } | { kind: "conversation"; id: string };

interface MessageRow {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  author_id: string;
  body: string;
  reply_to: string | null;
  pinned: number;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
}

const MSG_COLS = `id, channel_id, conversation_id, author_id, body, reply_to, pinned, created_at, edited_at, deleted_at`;

async function authorise(ctx: Ctx, viewer: Viewer, t: Target): Promise<{ role: CommunityRole | null; canPost: boolean; room: string }> {
  if (t.kind === "channel") {
    const { ch, role } = await loadChannel(ctx, viewer, t.id);
    return { role, canPost: canPost(role, ch), room: `channel:${ch.id}` };
  }
  await loadConversation(ctx, viewer, t.id);
  return { role: null, canPost: true, room: `conv:${t.id}` };
}

async function messageViews(ctx: Ctx, viewer: Viewer, rows: MessageRow[]): Promise<MessageView[]> {
  if (!rows.length) return [];
  const replyIds = rows.flatMap((r) => (r.reply_to ? [r.reply_to] : []));
  const [replies, reactions] = await Promise.all([
    replyIds.length ? all<{ id: string; author_id: string; body: string; deleted_at: number | null }>(ctx.db, `SELECT id, author_id, body, deleted_at FROM messages WHERE id IN (${inList(replyIds.length)})`, ...replyIds) : [],
    all<{ message_id: string; emoji: string; n: number; mine: number }>(
      ctx.db,
      `SELECT message_id, emoji, COUNT(*) AS n, MAX(user_id = ?) AS mine FROM message_reactions WHERE message_id IN (${inList(rows.length)}) GROUP BY message_id, emoji`,
      viewer.id,
      ...rows.map((r) => r.id),
    ),
  ]);
  const users = await summariesById(ctx, [...rows.map((r) => r.author_id), ...replies.map((r) => r.author_id)]);
  const replyBy = new Map(replies.map((r) => [r.id, r]));
  const reactBy = new Map<string, MessageView["reactions"]>();
  for (const r of reactions) {
    const list = reactBy.get(r.message_id) ?? [];
    list.push({ emoji: r.emoji, count: r.n, mine: !!r.mine });
    reactBy.set(r.message_id, list);
  }
  return rows.map((r) => {
    const rep = r.reply_to ? replyBy.get(r.reply_to) : undefined;
    return {
      id: r.id,
      channelId: r.channel_id,
      conversationId: r.conversation_id,
      author: users.get(r.author_id)!,
      body: r.deleted_at ? "" : r.body,
      replyTo: rep ? { id: rep.id, author: users.get(rep.author_id)?.displayName ?? "Unknown", body: rep.deleted_at ? "(deleted)" : rep.body.slice(0, 120) } : null,
      pinned: !!r.pinned,
      reactions: reactBy.get(r.id) ?? [],
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deleted: !!r.deleted_at,
    };
  });
}

function targetCol(t: Target) {
  return t.kind === "channel" ? "channel_id" : "conversation_id";
}

export async function listMessages(ctx: Ctx, viewer: Viewer, t: Target, before: number | null, limit = 50) {
  const { canPost: mayPost, role } = await authorise(ctx, viewer, t);
  const rows = await all<MessageRow>(
    ctx.db,
    `SELECT ${MSG_COLS} FROM messages WHERE ${targetCol(t)} = ? ${before ? "AND created_at < ?" : ""}
       AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ? AND b.blocked_id = messages.author_id)
     ORDER BY created_at DESC LIMIT ?`,
    ...([t.id, ...(before ? [before] : []), viewer.id, limit + 1] as Bind[]),
  );
  const more = rows.length > limit;
  const items = await messageViews(ctx, viewer, rows.slice(0, limit).reverse());
  return { items, hasMore: more, canPost: mayPost, canModerate: communityCan(role, "message.delete_any") };
}

export async function pinnedMessages(ctx: Ctx, viewer: Viewer, t: Target) {
  await authorise(ctx, viewer, t);
  const rows = await all<MessageRow>(ctx.db, `SELECT ${MSG_COLS} FROM messages WHERE ${targetCol(t)} = ? AND pinned = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`, t.id);
  return messageViews(ctx, viewer, rows);
}

export async function searchMessages(ctx: Ctx, viewer: Viewer, t: Target, q: string) {
  await authorise(ctx, viewer, t);
  const like = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
  const rows = await all<MessageRow>(ctx.db, `SELECT ${MSG_COLS} FROM messages WHERE ${targetCol(t)} = ? AND deleted_at IS NULL AND body LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 50`, t.id, like);
  return messageViews(ctx, viewer, rows);
}

export async function sendMessage(ctx: Ctx, viewer: Viewer, t: Target, body: string, replyTo?: string): Promise<MessageView> {
  await enforce(ctx, LIMIT.message, viewer.id);
  const { canPost: mayPost, room } = await authorise(ctx, viewer, t);
  if (!mayPost) throw forbidden("You can't post in this channel.");
  if (t.kind === "conversation") {
    // Re-check DM policy and blocks for 1:1 conversations at send time.
    const others = await all<{ user_id: string; username: string }>(
      ctx.db,
      `SELECT m.user_id, u.username FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? AND m.user_id <> ?`,
      t.id,
      viewer.id,
    );
    for (const o of others) if (await isBlockedEither(ctx, viewer.id, o.user_id)) throw forbidden("You can't message this person.");
  }
  if (replyTo && !(await one(ctx.db, `SELECT 1 FROM messages WHERE id = ? AND ${targetCol(t)} = ?`, replyTo, t.id))) throw notFound("Message");
  const id = newId("msg");
  const now = ctx.now();
  await ctx.db.batch([
    stmt(ctx.db, `INSERT INTO messages (id, ${targetCol(t)}, author_id, body, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, t.id, viewer.id, body, replyTo ?? null, now),
    stmt(ctx.db, `INSERT INTO read_states (user_id, target_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT(user_id, target_id) DO UPDATE SET last_read_at = excluded.last_read_at`, viewer.id, t.id, now),
    ...(t.kind === "conversation" ? [stmt(ctx.db, `UPDATE conversations SET last_message_at = ? WHERE id = ?`, now, t.id)] : []),
  ]);
  const [view] = await messageViews(ctx, viewer, [{ id, channel_id: t.kind === "channel" ? t.id : null, conversation_id: t.kind === "conversation" ? t.id : null, author_id: viewer.id, body, reply_to: replyTo ?? null, pinned: 0, created_at: now, edited_at: null, deleted_at: null }]);
  ctx.waitUntil(publish(ctx, room, { type: "message.created", message: view! }));
  if (t.kind === "conversation") {
    const others = await all<{ user_id: string }>(ctx.db, `SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?`, t.id, viewer.id);
    const link = `/connect/dm/${t.id}`;
    for (const o of others) {
      // Collapse: one unread message notification per conversation.
      if (await one(ctx.db, `SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'message' AND link = ? AND read_at IS NULL`, o.user_id, link)) continue;
      await notify(ctx, o.user_id, { kind: "message", actorId: viewer.id, title: `New message from ${viewer.displayName}`, body: body.slice(0, 140), link });
    }
  }
  return view!;
}

async function loadMessage(ctx: Ctx, viewer: Viewer, id: string) {
  const m = await one<MessageRow>(ctx.db, `SELECT ${MSG_COLS} FROM messages WHERE id = ?`, id);
  if (!m || m.deleted_at) throw notFound("Message");
  const t: Target = m.channel_id ? { kind: "channel", id: m.channel_id } : { kind: "conversation", id: m.conversation_id! };
  const auth = await authorise(ctx, viewer, t);
  return { m, t, ...auth };
}

export async function editMessage(ctx: Ctx, viewer: Viewer, id: string, body: string): Promise<MessageView> {
  const { m, room } = await loadMessage(ctx, viewer, id);
  if (m.author_id !== viewer.id) throw forbidden("You can only edit your own messages.");
  const now = ctx.now();
  await run(ctx.db, `UPDATE messages SET body = ?, edited_at = ? WHERE id = ?`, body, now, id);
  const [view] = await messageViews(ctx, viewer, [{ ...m, body, edited_at: now }]);
  ctx.waitUntil(publish(ctx, room, { type: "message.updated", message: view! }));
  return view!;
}

export async function deleteMessage(ctx: Ctx, viewer: Viewer, id: string) {
  const { m, role, room } = await loadMessage(ctx, viewer, id);
  if (m.author_id !== viewer.id && !communityCan(role, "message.delete_any")) throw forbidden();
  await run(ctx.db, `UPDATE messages SET deleted_at = ?, body = '' WHERE id = ?`, ctx.now(), id);
  if (m.author_id !== viewer.id) await audit(ctx, { actorId: viewer.id, action: "message.deleted_by_moderator", targetType: "message", targetId: id });
  ctx.waitUntil(publish(ctx, room, { type: "message.deleted", id }));
}

export async function pinMessage(ctx: Ctx, viewer: Viewer, id: string, pinned: boolean): Promise<MessageView> {
  const { m, t, role, room } = await loadMessage(ctx, viewer, id);
  if (t.kind === "channel" && !communityCan(role, "message.pin")) throw forbidden();
  await run(ctx.db, `UPDATE messages SET pinned = ? WHERE id = ?`, pinned ? 1 : 0, id);
  const [view] = await messageViews(ctx, viewer, [{ ...m, pinned: pinned ? 1 : 0 }]);
  ctx.waitUntil(publish(ctx, room, { type: "message.updated", message: view! }));
  return view!;
}

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:️|‍(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})|\p{Emoji_Modifier})*$/u;

export async function toggleReaction(ctx: Ctx, viewer: Viewer, id: string, emoji: string): Promise<MessageView> {
  if (!EMOJI_RE.test(emoji) || emoji.length > 16) throw badRequest("React with a single emoji.");
  const { m, room } = await loadMessage(ctx, viewer, id);
  const n = await run(ctx.db, `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`, id, viewer.id, emoji);
  if (!n) {
    const distinct = (await one<{ n: number }>(ctx.db, `SELECT COUNT(DISTINCT emoji) AS n FROM message_reactions WHERE message_id = ?`, id))?.n ?? 0;
    if (distinct >= 20) throw badRequest("This message has too many different reactions.");
    await run(ctx.db, `INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)`, id, viewer.id, emoji, ctx.now());
  }
  const [view] = await messageViews(ctx, viewer, [m]);
  ctx.waitUntil(publish(ctx, room, { type: "message.updated", message: view! }));
  return view!;
}

export async function markRead(ctx: Ctx, viewer: Viewer, t: Target) {
  await authorise(ctx, viewer, t);
  await run(ctx.db, `INSERT INTO read_states (user_id, target_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT(user_id, target_id) DO UPDATE SET last_read_at = excluded.last_read_at`, viewer.id, t.id, ctx.now());
  if (t.kind === "conversation") await run(ctx.db, `UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = 'message' AND link = ? AND read_at IS NULL`, ctx.now(), viewer.id, `/connect/dm/${t.id}`);
}

/** Authorises a realtime subscription. Returns the canonical room name. */
export async function authoriseRoom(ctx: Ctx, viewer: Viewer, room: string): Promise<string> {
  const [kind, id] = room.split(":");
  if (!id || id.length > 40) throw badRequest("Unknown room.");
  if (kind === "user") {
    if (id !== viewer.id) throw forbidden();
    return `user:${id}`;
  }
  if (kind === "channel") return (await authorise(ctx, viewer, { kind: "channel", id })).room;
  if (kind === "conv") return (await authorise(ctx, viewer, { kind: "conversation", id })).room;
  throw new AppError("bad_request", "Unknown room.");
}
