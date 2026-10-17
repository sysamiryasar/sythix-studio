import { describe, expect, it } from "vitest";
import { createTestApp, signUp, type Client } from "./helpers/app";
import type { ChannelView, CommunitySummary, ConversationView, MessageView } from "@shared/types";

async function community(owner: Client, slug = "builders", visibility: "public" | "private" = "public") {
  await owner.post("/communities", { name: "Builders Guild", slug, description: "We build", visibility });
  return (await owner.get<{ community: CommunitySummary; channels: ChannelView[] }>(`/communities/${slug}`)).data;
}

describe("communities", () => {
  it("creates a community with default channels and the creator as owner", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Owner");
    const c = await community(a);
    expect(c.community.myRole).toBe("owner");
    expect(c.channels.map((ch) => ch.name)).toEqual(["general", "announcements"]);
    expect((await a.post("/communities", { name: "Dup", slug: "builders" })).status).toBe(409);
    expect((await a.post("/communities", { name: "Bad", slug: "Bad Slug!" })).status).toBe(422);
  });

  it("public communities can be joined; private ones need an invite and are hidden", async () => {
    const t = createTestApp();
    const a = await signUp(t, "OwnerA");
    const b = await signUp(t, "Joiner");
    await community(a, "open");
    await community(a, "secret", "private");
    expect((await b.post("/communities/open/join")).status).toBe(200);
    expect((await b.get("/communities/secret")).status).toBe(404);
    expect((await b.post("/communities/secret/join")).status).toBe(404);
    const inv = (await a.post<{ code: string }>("/communities/secret/invites", { maxUses: 1 })).data;
    expect((await b.post<CommunitySummary>(`/invites/${inv.code}/accept`)).data.slug).toBe("secret");
    const c = await signUp(t, "Late");
    expect((await c.post(`/invites/${inv.code}/accept`)).status).toBe(404); // used up
  });

  it("enforces roles: members can't moderate, and nobody acts on their equals or betters", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Own");
    const mod = await signUp(t, "Moddy");
    const m1 = await signUp(t, "Mem1");
    await community(owner);
    for (const c of [mod, m1]) await c.post("/communities/builders/join");
    const ids = Object.fromEntries((await owner.get<{ user: { id: string; username: string } }[]>("/communities/builders/members")).data.map((m) => [m.user.username, m.user.id]));

    expect((await m1.post(`/communities/builders/members/${ids.Moddy}`, { type: "kick" })).status).toBe(403);
    expect((await owner.post(`/communities/builders/members/${ids.Moddy}`, { type: "role", role: "moderator" })).status).toBe(200);
    expect((await mod.post(`/communities/builders/members/${ids.Own}`, { type: "kick" })).status).toBe(403);
    expect((await mod.post(`/communities/builders/members/${ids.Mem1}`, { type: "role", role: "admin" })).status).toBe(403);
    expect((await mod.post(`/communities/builders/members/${ids.Mem1}`, { type: "ban" })).status).toBe(403); // ban is admin+
    expect((await mod.post(`/communities/builders/members/${ids.Mem1}`, { type: "kick" })).status).toBe(200);
    expect((await owner.post(`/communities/builders/members/${ids.Mem1}`, { type: "ban", reason: "spam" })).status).toBe(200);
    expect((await m1.post("/communities/builders/join")).status).toBe(404); // banned looks missing
    expect((await owner.post("/communities/builders/leave")).status).toBe(400);
  });
});

describe("channels and messages", () => {
  it("members chat; announcements are moderator-only; restricted channels are invisible", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Chief");
    const m = await signUp(t, "Chatter");
    const outsider = await signUp(t, "Outside");
    const c = await community(owner);
    await m.post("/communities/builders/join");
    const general = c.channels.find((x) => x.name === "general")!;
    const ann = c.channels.find((x) => x.name === "announcements")!;

    const sent = await m.post<MessageView>(`/channels/${general.id}/messages`, { body: "hello world" });
    expect(sent.status).toBe(201);
    expect(t.published.at(-1)).toMatchObject({ room: `channel:${general.id}`, event: { type: "message.created" } });
    expect((await m.post(`/channels/${ann.id}/messages`, { body: "not allowed" })).status).toBe(403);
    expect((await owner.post(`/channels/${ann.id}/messages`, { body: "v1 is live" })).status).toBe(201);
    expect((await outsider.get(`/channels/${general.id}/messages`)).status).toBe(404);
    expect((await outsider.post(`/channels/${general.id}/messages`, { body: "let me in" })).status).toBe(404);

    const staff = (await owner.post<{ id: string }>("/communities/builders/channels", { name: "staff", minRole: "moderator" })).data;
    expect((await m.get(`/channels/${staff.id}/messages`)).status).toBe(404);
    expect((await m.get<{ channels: ChannelView[] }>("/communities/builders")).data.channels.map((x) => x.name)).not.toContain("staff");
    expect((await m.post("/communities/builders/channels", { name: "mine" })).status).toBe(403);

    // Edit own, can't edit others; moderators can delete; reactions toggle.
    expect((await owner.patch(`/messages/${sent.data.id}`, { body: "edited by boss" })).status).toBe(403);
    expect((await m.patch<MessageView>(`/messages/${sent.data.id}`, { body: "hello edited" })).data.editedAt).not.toBeNull();
    expect((await m.post<MessageView>(`/messages/${sent.data.id}/reactions`, { emoji: "🔥" })).data.reactions).toEqual([{ emoji: "🔥", count: 1, mine: true }]);
    expect((await m.post(`/messages/${sent.data.id}/reactions`, { emoji: "not emoji" })).status).toBe(400);
    expect((await m.post(`/messages/${sent.data.id}/pin`, { pinned: true })).status).toBe(403);
    expect((await owner.post(`/messages/${sent.data.id}/pin`, { pinned: true })).status).toBe(200);
    expect((await m.get<MessageView[]>(`/channels/${general.id}/pins`)).data).toHaveLength(1);
    expect((await m.get<MessageView[]>(`/channels/${general.id}/search?q=edited`)).data).toHaveLength(1);
    expect((await owner.del(`/messages/${sent.data.id}`)).status).toBe(200);
    const list = (await m.get<{ items: MessageView[] }>(`/channels/${general.id}/messages`)).data.items;
    expect(list.find((x) => x.id === sent.data.id)?.deleted).toBe(true);
  });

  it("tracks unread state per channel", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Reader");
    const m = await signUp(t, "Writer");
    const c = await community(owner);
    await m.post("/communities/builders/join");
    const general = c.channels.find((x) => x.name === "general")!;
    await m.post(`/channels/${general.id}/messages`, { body: "ping" });
    const unread = async () => (await owner.get<{ channels: ChannelView[] }>("/communities/builders")).data.channels.find((x) => x.id === general.id)!.unread;
    expect(await unread()).toBe(true);
    await owner.post(`/channels/${general.id}/read`);
    expect(await unread()).toBe(false);
  });
});

describe("direct messages", () => {
  it("respects DM policy, reuses 1:1 conversations and keeps them private", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Dmer");
    const b = await signUp(t, "Dmee");
    const c = await signUp(t, "Snoop");
    // Default policy: only people b follows can message b.
    expect((await a.post("/conversations", { usernames: ["Dmee"] })).status).toBe(403);
    await b.post("/users/Dmer/follow");
    const conv = (await a.post<{ id: string }>("/conversations", { usernames: ["Dmee"] })).data;
    expect((await a.post<{ id: string }>("/conversations", { usernames: ["Dmee"] })).data.id).toBe(conv.id);
    await a.post(`/conversations/${conv.id}/messages`, { body: "hey there" });
    expect(t.published.some((p) => p.room === `conv:${conv.id}`)).toBe(true);
    expect((await c.get(`/conversations/${conv.id}/messages`)).status).toBe(404);
    const list = (await b.get<ConversationView[]>("/conversations")).data;
    expect(list[0]).toMatchObject({ id: conv.id, unread: true, title: "Dmer" });
    expect((await b.get<{ items: { kind: string }[] }>("/notifications")).data.items.map((n) => n.kind)).toContain("message");
    // Blocking stops further messages.
    await b.post("/users/Dmer/block");
    expect((await a.post(`/conversations/${conv.id}/messages`, { body: "still there?" })).status).toBe(403);
  });

  it("supports group conversations", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Host");
    const b = await signUp(t, "Guest1");
    const c = await signUp(t, "Guest2");
    for (const u of [b, c]) await u.patch("/me/privacy", { profileVisibility: "public", dmPolicy: "everyone", allowMentions: true, showActivity: true });
    const g = (await a.post<{ id: string }>("/conversations", { usernames: ["Guest1", "Guest2"], title: "Squad" })).data;
    expect((await c.get<ConversationView>(`/conversations/${g.id}`)).data).toMatchObject({ kind: "group", title: "Squad" });
    await c.post(`/conversations/${g.id}/leave`);
    expect((await c.get(`/conversations/${g.id}`)).status).toBe(404);
  });
});

describe("realtime authorisation", () => {
  it("only lets members open rooms and rejects cross-site sockets", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "RtOwner");
    const outsider = await signUp(t, "RtOut");
    const c = await community(owner);
    const general = c.channels[0]!;
    const ws = (u: Client, room: string, origin = "http://unite.test") => u.req("GET", `/realtime?room=${room}`, undefined, { upgrade: "websocket", origin });
    expect((await ws(owner, `channel:${general.id}`)).status).toBe(200); // forwarded to the (fake) Durable Object
    expect((await ws(outsider, `channel:${general.id}`)).status).toBe(404);
    expect((await ws(owner, `channel:${general.id}`, "https://evil.example")).status).toBe(403);
    expect((await ws(outsider, `user:someone-else`)).status).toBe(403);
  });

  it("reports voice as unavailable without a media backend", async () => {
    const t = createTestApp();
    const a = await signUp(t);
    const r = await a.get<{ available: boolean; requirements: string[] }>("/voice/status");
    expect(r.data.available).toBe(false);
    expect(r.data.requirements.length).toBeGreaterThan(0);
  });
});
