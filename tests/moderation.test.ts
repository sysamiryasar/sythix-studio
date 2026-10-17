import { describe, expect, it } from "vitest";
import { createTestApp, signUp } from "./helpers/app";
import type { PostView } from "@shared/types";

describe("reports and moderation", () => {
  it("users report visible content; moderators review and remove it", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Admin1");
    const poster = await signUp(t, "Spammer");
    const reporter = await signUp(t, "Reporter");
    const p = (await poster.post<PostView>("/posts", { body: "buy cheap gold" })).data;
    expect((await reporter.post("/reports", { targetType: "post", targetId: p.id, reason: "spam" })).status).toBe(201);
    expect((await reporter.post("/reports", { targetType: "post", targetId: p.id, reason: "spam" })).status).toBe(409);
    expect((await reporter.post("/reports", { targetType: "post", targetId: "pst_doesnotexist", reason: "spam" })).status).toBe(404);

    expect((await reporter.get("/mod/reports")).status).toBe(403);
    const reports = (await owner.get<{ id: string; preview: { text: string } }[]>("/mod/reports")).data;
    expect(reports[0]?.preview.text).toBe("buy cheap gold");
    expect((await owner.post(`/mod/reports/${reports[0]!.id}`, { action: "remove", note: "spam" })).status).toBe(200);
    expect((await reporter.get(`/posts/${p.id}`)).status).toBe(404);
    // The author still sees their hidden post, flagged as hidden.
    expect((await poster.get<PostView>(`/posts/${p.id}`)).data.hidden).toBe(true);
    expect((await owner.get<unknown[]>("/mod/reports")).data).toHaveLength(0);
  });

  it("suspension signs the user out and is limited by rank", async () => {
    const t = createTestApp();
    const owner = await signUp(t, "Root");
    const mod = await signUp(t, "Moder");
    const user = await signUp(t, "Troll");
    const ids = Object.fromEntries((await owner.get<{ id: string; username: string }[]>("/mod/users")).data.map((u) => [u.username, u.id]));
    expect((await mod.get("/mod/users")).status).toBe(403);
    await owner.post(`/mod/users/${ids.Moder}/role`, { role: "admin" });
    expect((await mod.post(`/mod/users/${ids.Root}/suspend`, { suspended: true })).status).toBe(403);
    expect((await mod.post(`/mod/users/${ids.Troll}/suspend`, { suspended: true, reason: "abuse" })).status).toBe(200);
    expect((await user.get("/me")).data).toBeNull();
    expect((await owner.get(`/users/Troll`)).status).toBe(404);
    expect((await owner.get<{ action: string }[]>("/mod/audit")).data.map((a) => a.action)).toContain("user.suspended");
  });
});
