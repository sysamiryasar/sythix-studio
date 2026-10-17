import { describe, expect, it } from "vitest";
import { createTestApp, signUp } from "./helpers/app";
import type { CommentView, NotificationView, Page, PostView, SearchResults } from "@shared/types";
import { extractMentions, extractTags } from "@worker/services/social";
import { sniff } from "@worker/services/media";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0]);

describe("parsing", () => {
  it("extracts hashtags and mentions without false positives", () => {
    expect(extractTags("GG #Minecraft and #PvP_Club, not a#tag or &#39;")).toEqual(["minecraft", "pvp_club"]);
    expect(extractMentions("hi @Alex and @bob_1, mail me@example.com")).toEqual(["alex", "bob_1"]);
  });
  it("identifies uploads by their bytes, not their names", () => {
    expect(sniff(PNG)).toMatchObject({ kind: "image", contentType: "image/png", width: 64, height: 32 });
    expect(sniff(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    const mp4 = new Uint8Array(32);
    mp4.set(new TextEncoder().encode("ftypisom"), 4);
    expect(sniff(mp4)).toMatchObject({ kind: "video", contentType: "video/mp4" });
  });
});

describe("posts and visibility", () => {
  it("creates posts and enforces public / followers / private visibility everywhere", async () => {
    const t = createTestApp();
    const author = await signUp(t, "Author");
    const follower = await signUp(t, "Follower");
    const stranger = await signUp(t, "Stranger");
    await follower.post("/users/Author/follow");

    const pub = (await author.post<PostView>("/posts", { body: "public #hello", visibility: "public" })).data;
    const fol = (await author.post<PostView>("/posts", { body: "followers only", visibility: "followers" })).data;
    const priv = (await author.post<PostView>("/posts", { body: "just me", visibility: "private" })).data;

    const seen = async (c: typeof author) => (await c.get<Page<PostView>>("/users/Author/posts")).data.items.map((p) => p.id).sort();
    expect(await seen(author)).toEqual([pub.id, fol.id, priv.id].sort());
    expect(await seen(follower)).toEqual([pub.id, fol.id].sort());
    expect(await seen(stranger)).toEqual([pub.id]);
    expect((await stranger.get(`/posts/${fol.id}`)).status).toBe(404);
    expect((await stranger.get(`/posts/${priv.id}`)).status).toBe(404);
    // Search and tags apply the same rules.
    expect((await stranger.get<SearchResults>("/search?q=followers")).data.posts).toHaveLength(0);
    expect((await follower.get<SearchResults>("/search?q=followers")).data.posts).toHaveLength(1);
    expect((await stranger.get<Page<PostView>>("/tags/hello")).data.items).toHaveLength(1);
  });

  it("a followers-only profile hides even its public posts from non-followers", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Quiet");
    const b = await signUp(t, "Outsider");
    const p = (await a.post<PostView>("/posts", { body: "hi", visibility: "public" })).data;
    await a.patch("/me/privacy", { profileVisibility: "followers", dmPolicy: "followers", allowMentions: true, showActivity: true });
    expect((await b.get(`/posts/${p.id}`)).status).toBe(404);
    expect((await b.get<Page<PostView>>("/feed?tab=discover")).data.items).toHaveLength(0);
  });

  it("blocking hides content in both directions and removes follows", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Blocker");
    const b = await signUp(t, "Blocked");
    await b.post("/users/Blocker/follow");
    const p = (await a.post<PostView>("/posts", { body: "visible?", visibility: "public" })).data;
    await a.post("/users/Blocked/block");
    expect((await b.get(`/posts/${p.id}`)).status).toBe(404);
    expect((await b.get("/users/Blocker")).status).toBe(404);
    expect((await b.post("/users/Blocker/follow")).status).toBe(404);
    expect(t.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM follows`).get()).toEqual({ n: 0 });
  });

  it("validates post input and edits/deletes only own posts", async () => {
    const t = createTestApp();
    const a = await signUp(t);
    const b = await signUp(t);
    expect((await a.post("/posts", { body: "   ", visibility: "public" })).status).toBe(422);
    expect((await a.post("/posts", { body: "x".repeat(2001) })).status).toBe(422);
    const p = (await a.post<PostView>("/posts", { body: "first #one" })).data;
    expect((await b.patch(`/posts/${p.id}`, { body: "hacked" })).status).toBe(404);
    expect((await b.del(`/posts/${p.id}`)).status).toBe(404);
    const edited = (await a.patch<PostView>(`/posts/${p.id}`, { body: "edited #two" })).data;
    expect(edited.editedAt).not.toBeNull();
    expect((await a.get<Page<PostView>>("/tags/one")).data.items).toHaveLength(0);
    expect((await a.get<Page<PostView>>("/tags/two")).data.items).toHaveLength(1);
    expect((await a.del(`/posts/${p.id}`)).status).toBe(200);
    expect((await a.get(`/posts/${p.id}`)).status).toBe(404);
  });
});

describe("feeds", () => {
  it("home shows own + followed; following excludes own; discover recommends others' public posts", async () => {
    const t = createTestApp();
    const me = await signUp(t, "Me1");
    const friend = await signUp(t, "Friend1");
    const other = await signUp(t, "Other1");
    await me.post("/users/Friend1/follow");
    await me.post("/posts", { body: "mine" });
    await friend.post("/posts", { body: "friend's" });
    await other.post("/posts", { body: "other's" });
    const bodies = async (tab: string) => (await me.get<Page<PostView>>(`/feed?tab=${tab}`)).data.items.map((p) => p.body).sort();
    expect(await bodies("home")).toEqual(["friend's", "mine"]);
    expect(await bodies("following")).toEqual(["friend's"]);
    expect(await bodies("discover")).toEqual(["other's"]);
  });

  it("paginates with a stable cursor", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Pager");
    for (let i = 0; i < 25; i++) await a.post("/posts", { body: `post ${i}` });
    const p1 = (await a.get<Page<PostView>>("/feed")).data;
    expect(p1.items).toHaveLength(20);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await a.get<Page<PostView>>(`/feed?cursor=${p1.nextCursor}`)).data;
    expect(p2.items).toHaveLength(5);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items].map((p) => p.id)).size).toBe(25);
  });
});

describe("engagement", () => {
  it("reactions, reposts, bookmarks and comments update counts and notify", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Creator");
    const b = await signUp(t, "Fan");
    const p = (await a.post<PostView>("/posts", { body: "rate my build" })).data;

    let v = (await b.put<PostView>(`/posts/${p.id}/reaction`, { kind: "fire" })).data;
    expect(v.counts.reactions).toBe(1);
    expect(v.viewer.reaction).toBe("fire");
    v = (await b.put<PostView>(`/posts/${p.id}/reaction`, { kind: "gg" })).data;
    expect(v.counts.reactions).toBe(1);
    v = (await b.post<PostView>(`/posts/${p.id}/repost`)).data;
    expect(v.counts.reposts).toBe(1);
    expect((await b.post<PostView>(`/posts/${p.id}/repost`)).data.counts.reposts).toBe(1);
    await b.put(`/posts/${p.id}/bookmark`);
    expect((await b.get<Page<PostView>>("/bookmarks")).data.items.map((x) => x.id)).toEqual([p.id]);

    const c1 = (await b.post<CommentView>(`/posts/${p.id}/comments`, { body: "nice @Creator" })).data;
    const reply = (await a.post<CommentView>(`/posts/${p.id}/comments`, { body: "thanks", parentId: c1.id })).data;
    const nested = (await b.post<CommentView>(`/posts/${p.id}/comments`, { body: "np", parentId: reply.id })).data;
    expect(nested.parentId).toBe(c1.id); // one level of nesting
    expect((await a.get<PostView>(`/posts/${p.id}`)).data.counts.comments).toBe(3);

    const notes = (await a.get<{ items: NotificationView[] }>("/notifications")).data.items.map((n) => n.kind);
    expect(notes).toEqual(expect.arrayContaining(["reaction", "repost", "comment", "mention"]));
    expect((await b.get<{ items: NotificationView[] }>("/notifications")).data.items.map((n) => n.kind)).toContain("reply");

    // Reposts appear in the reposter's profile and can be undone.
    const bPosts = (await a.get<Page<PostView>>("/users/Fan/posts")).data.items;
    expect(bPosts[0]?.repostOf?.id).toBe(p.id);
    expect((await b.del<PostView>(`/posts/${p.id}/repost`)).data.counts.reposts).toBe(0);
    await b.del(`/posts/${p.id}/reaction`);
    expect((await a.get<PostView>(`/posts/${p.id}`)).data.counts.reactions).toBe(0);
  });

  it("only public posts can be reposted; only allowed users delete comments", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Boss1");
    const a = await signUp(t, "Poster");
    const b = await signUp(t, "Commenter");
    const c = await signUp(t, "Rando");
    await b.post("/users/Poster/follow");
    await c.post("/users/Poster/follow");
    const fol = (await a.post<PostView>("/posts", { body: "followers", visibility: "followers" })).data;
    expect((await b.post(`/posts/${fol.id}/repost`)).status).toBe(400);
    const cm = (await b.post<CommentView>(`/posts/${fol.id}/comments`, { body: "hmm" })).data;
    expect((await c.del(`/comments/${cm.id}`)).status).toBe(403);
    expect((await a.del(`/comments/${cm.id}`)).status).toBe(200); // post author may remove
    void owner;
  });

  it("mentions only notify people who can see the post and allow mentions", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Mentioner");
    const b = await signUp(t, "Mentioned");
    await a.post("/posts", { body: "secret @Mentioned", visibility: "private" });
    expect((await b.get<{ items: NotificationView[] }>("/notifications")).data.items).toHaveLength(0);
    await b.patch("/me/privacy", { profileVisibility: "public", dmPolicy: "followers", allowMentions: false, showActivity: true });
    await a.post("/posts", { body: "hey @Mentioned" });
    expect((await b.get<{ items: NotificationView[] }>("/notifications")).data.items).toHaveLength(0);
  });

  it("trending counts public tags only", async () => {
    const t = createTestApp();
    const a = await signUp(t);
    await a.post("/posts", { body: "#build #build2" });
    await a.post("/posts", { body: "#build" });
    await a.post("/posts", { body: "#secret", visibility: "private" });
    const tr = (await a.get<{ tag: string; count: number }[]>("/tags/trending")).data;
    expect(tr[0]).toEqual({ tag: "build", count: 2 });
    expect(tr.map((x) => x.tag)).not.toContain("secret");
  });
});

describe("media", () => {
  it("uploads images, attaches them to posts and authorises downloads by post visibility", async () => {
    const t = createTestApp();
    const a = await signUp(t, "Shooter");
    const b = await signUp(t, "Looker");
    const up = await a.req<{ id: string; kind: string }>("POST", "/media", PNG);
    expect(up.status).toBe(201);
    expect(up.data.kind).toBe("image");
    // Unattached media is private to the uploader.
    expect((await b.get(`/media/${up.data.id}`)).status).toBe(404);
    const p = (await a.post<PostView>("/posts", { body: "", mediaIds: [up.data.id], visibility: "private" })).data;
    expect(p.media).toHaveLength(1);
    expect((await b.get(`/media/${up.data.id}`)).status).toBe(404);
    const res = await t.fetchApi(`/media/${up.data.id}`, { headers: { cookie: a.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Media can't be attached twice or by someone else.
    expect((await b.post("/posts", { body: "steal", mediaIds: [up.data.id] })).status).toBe(400);
  });

  it("rejects unsupported files", async () => {
    const t = createTestApp();
    const a = await signUp(t);
    const r = await a.req("POST", "/media", new TextEncoder().encode("<html><script>alert(1)</script></html>"));
    expect(r.status).toBe(415);
  });

  it("serves byte ranges for video seeking", async () => {
    const t = createTestApp();
    const a = await signUp(t);
    const mp4 = new Uint8Array(1000);
    mp4.set(new TextEncoder().encode("ftypisom"), 4);
    const up = await a.req<{ id: string }>("POST", "/media", mp4);
    const res = await t.fetchApi(`/media/${up.data.id}`, { headers: { cookie: a.cookie, range: "bytes=100-199" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
  });
});
