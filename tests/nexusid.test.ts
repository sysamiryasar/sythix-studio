import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { createTestApp, createUser, type TestApp } from "./helpers/app";
import { getPublicProfile, updateProfile } from "@/modules/nexusid/profiles";
import { blockUser, createReport, listFriends, respondToFriendRequest, sendFriendRequest } from "@/modules/nexusid/social";
import { listCosmetics, setLoadout } from "@/modules/nexusid/cosmetics";
import { createTeam, getTeam, inviteToTeam, respondToInvite, removeMember } from "@/modules/nexusid/teams";
import { startLink, completeLink } from "@/modules/nexusid/minecraft";
import { one } from "@/lib/db/sql";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
});

describe("profiles and privacy", () => {
  it("enforces public / friends / private visibility server-side", async () => {
    const a = await createUser(app, "Owner1");
    const b = await createUser(app, "Viewer1");
    expect((await getPublicProfile(app.ctx, null, "Owner1"))?.state).toBe("visible");

    await updateProfile(app.ctx, a.user.id, { visibility: "friends" });
    expect((await getPublicProfile(app.ctx, b.user, "Owner1"))?.state).toBe("friends_only");
    expect((await getPublicProfile(app.ctx, null, "Owner1"))?.state).toBe("friends_only");
    expect((await getPublicProfile(app.ctx, b.user, "Owner1"))?.profile).toBeUndefined();

    await sendFriendRequest(app.ctx, b.user, "Owner1");
    const req = (await listFriends(app.ctx, a.user.id))[0]!;
    await respondToFriendRequest(app.ctx, a.user, req.friendship_id, "accept");
    expect((await getPublicProfile(app.ctx, b.user, "Owner1"))?.state).toBe("visible");

    await updateProfile(app.ctx, a.user.id, { visibility: "private" });
    expect((await getPublicProfile(app.ctx, b.user, "Owner1"))?.state).toBe("private");
    expect((await getPublicProfile(app.ctx, a.user, "Owner1"))?.state).toBe("visible");
  });

  it("hides sections the owner turned off", async () => {
    const a = await createUser(app, "Hider");
    await updateProfile(app.ctx, a.user.id, { showStats: false, showAchievements: false });
    const p = await getPublicProfile(app.ctx, null, "Hider");
    expect(p?.stats).toBeUndefined();
    expect(p?.achievements).toBeUndefined();
  });

  it("awards profile_complete only for a customised profile", async () => {
    const a = await createUser(app, "Styler");
    await updateProfile(app.ctx, a.user.id, { bio: "short" });
    expect(await one(app.ctx.db, `SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = 'profile_complete'`, a.user.id)).toBeNull();
    await updateProfile(app.ctx, a.user.id, { bio: "Builder of redstone things", bannerStyle: "end" });
    expect(await one(app.ctx.db, `SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = 'profile_complete'`, a.user.id)).not.toBeNull();
  });
});

describe("friends and blocks", () => {
  it("accepting a request befriends both and awards achievements to both", async () => {
    const a = await createUser(app, "FriendA");
    const b = await createUser(app, "FriendB");
    await sendFriendRequest(app.ctx, a.user, "FriendB");
    await expect(sendFriendRequest(app.ctx, a.user, "FriendB")).rejects.toMatchObject({ code: "conflict" });
    const incoming = (await listFriends(app.ctx, b.user.id)).find((f) => f.direction === "incoming")!;
    // The requester cannot accept their own request.
    await expect(respondToFriendRequest(app.ctx, a.user, incoming.friendship_id, "accept")).rejects.toMatchObject({ code: "not_found" });
    await respondToFriendRequest(app.ctx, b.user, incoming.friendship_id, "accept");
    for (const u of [a, b]) {
      expect(await one(app.ctx.db, `SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = 'first_friend'`, u.user.id)).not.toBeNull();
    }
  });

  it("a block removes the friendship, hides the profile and stops requests", async () => {
    const a = await createUser(app, "Blocker");
    const b = await createUser(app, "Blocked");
    await sendFriendRequest(app.ctx, b.user, "Blocker");
    await blockUser(app.ctx, a.user, "Blocked");
    expect(await listFriends(app.ctx, a.user.id)).toEqual([]);
    expect(await getPublicProfile(app.ctx, b.user, "Blocker")).toBeNull();
    await expect(sendFriendRequest(app.ctx, b.user, "Blocker")).rejects.toMatchObject({ code: "not_found" });
  });

  it("respects allow_friend_requests", async () => {
    const a = await createUser(app, "Closed");
    const b = await createUser(app, "Knocker");
    await updateProfile(app.ctx, a.user.id, { allowFriendRequests: false });
    await expect(sendFriendRequest(app.ctx, b.user, "Closed")).rejects.toMatchObject({ code: "bad_request" });
  });

  it("reports require an existing target and are rate limited", async () => {
    const a = await createUser(app, "Reporter");
    const b = await createUser(app, "Reported");
    await expect(createReport(app.ctx, a.user, { targetType: "user", targetId: "usr_doesnotexist", reason: "spam", details: "" })).rejects.toMatchObject({
      code: "not_found",
    });
    const codes: string[] = [];
    for (let i = 0; i < 11; i++) {
      try {
        await createReport(app.ctx, a.user, { targetType: "user", targetId: b.user.id, reason: "spam", details: "" });
        codes.push("ok");
      } catch (e) {
        codes.push((e as { code: string }).code);
      }
    }
    expect(codes.filter((c) => c === "ok").length).toBe(9); // 1 failed lookup + 9 allowed, then limited
    expect(codes.at(-1)).toBe("rate_limited");
  });
});

describe("cosmetics", () => {
  it("only owned cosmetics can be equipped, in their own slot", async () => {
    const a = await createUser(app, "Cosmo");
    const items = await listCosmetics(app.ctx, a.user.id);
    expect(items.find((c) => c.id === "cape_obsidian")?.owned).toBe(1);
    expect(items.find((c) => c.id === "wings_voxel")?.owned).toBe(0);
    expect(items.every((c) => c.is_placeholder === 1)).toBe(true);
    await setLoadout(app.ctx, a.user.id, { category: "cape", cosmeticId: "cape_obsidian" });
    await expect(setLoadout(app.ctx, a.user.id, { category: "wings", cosmeticId: "wings_voxel" })).rejects.toMatchObject({ code: "bad_request" });
    await expect(setLoadout(app.ctx, a.user.id, { category: "wings", cosmeticId: "cape_obsidian" })).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("teams", () => {
  it("private teams are hidden from non-members; only owners invite and remove", async () => {
    const owner = await createUser(app, "Captain");
    const member = await createUser(app, "Crew");
    const outsider = await createUser(app, "Stranger");
    const { id, slug } = await createTeam(app.ctx, owner.user, { name: "Night Shift", description: "", visibility: "private" });
    expect(await getTeam(app.ctx, outsider.user, slug)).toBeNull();
    await inviteToTeam(app.ctx, owner.user, id, "Crew");
    expect((await getTeam(app.ctx, member.user, slug))?.viewerInvited).toBe(true);
    await respondToInvite(app.ctx, member.user, id, "accept");
    await expect(inviteToTeam(app.ctx, member.user, id, "Stranger")).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeMember(app.ctx, member.user, id, owner.user.id)).rejects.toMatchObject({ code: "forbidden" });
    await removeMember(app.ctx, owner.user, id, member.user.id);
    expect(await getTeam(app.ctx, member.user, slug)).toBeNull();
  });
});

describe("Minecraft linking", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is unavailable without Microsoft app credentials", async () => {
    const a = await createUser(app, "NoMs");
    await expect(startLink(app.ctx, a.user.id)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("completes the Microsoft -> Xbox -> Minecraft chain and stores only the public profile", async () => {
    const msApp = createTestApp({ MS_CLIENT_ID: "client", MS_CLIENT_SECRET: "secret" });
    const a = await createUser(msApp, "Linker");
    const url = new URL(await startLink(msApp.ctx, a.user.id));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state")!;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const u = String(input);
      calls.push(u);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      if (u.includes("oauth2/v2.0/token")) return json({ access_token: "ms" });
      if (u.includes("user.auth.xboxlive.com")) return json({ Token: "xbl", DisplayClaims: { xui: [{ uhs: "123" }] } });
      if (u.includes("xsts.auth.xboxlive.com")) return json({ Token: "xsts" });
      if (u.includes("login_with_xbox")) return json({ access_token: "mc" });
      if (u.includes("minecraft/profile")) return json({ id: "069a79f444e94726a5befca90e38aaf5", name: "Notch" });
      return new Response("unexpected", { status: 500 });
    });
    // A different signed-in user cannot complete someone else's flow.
    const other = await createUser(msApp, "Hijacker");
    await expect(completeLink(msApp.ctx, other.user.id, "code", state)).rejects.toMatchObject({ code: "bad_request" });

    const url2 = new URL(await startLink(msApp.ctx, a.user.id));
    const res = await completeLink(msApp.ctx, a.user.id, "code", url2.searchParams.get("state")!);
    expect(res).toEqual({ name: "Notch", uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5" });
    expect(calls.length).toBe(5);
    const row = await one<Record<string, unknown>>(msApp.ctx.db, `SELECT * FROM verified_identities WHERE user_id = ?`, a.user.id);
    expect(JSON.stringify(row)).not.toMatch(/xsts|"mc"|ms"/);
    // State is single-use.
    await expect(completeLink(msApp.ctx, a.user.id, "code", url2.searchParams.get("state")!)).rejects.toBeTruthy();
  });
});
