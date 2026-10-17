import { z } from "zod";
import type { Hono } from "hono";
import { channelSchema, communitySchema, communityUpdateSchema, conversationSchema, messageSchema } from "@shared/schemas";
import { COMMUNITY_ROLES } from "@shared/permissions";
import { body, ok, requireUser, type AppEnv } from "../app";
import * as connect from "../services/connect";
import { AppError } from "../lib/errors";
import { one } from "../lib/db";

const ch = (id: string): connect.Target => ({ kind: "channel", id });
const cv = (id: string): connect.Target => ({ kind: "conversation", id });

export function connectRoutes(app: Hono<AppEnv>) {
  app.get("/communities", async (c) => {
    const v = requireUser(c);
    const ctx = c.get("ctx");
    return ok(c, { mine: await connect.myCommunities(ctx, v), discover: await connect.discoverCommunities(ctx, v, c.req.query("q")?.slice(0, 50)) });
  });
  app.post("/communities", async (c) => ok(c, await connect.createCommunity(c.get("ctx"), requireUser(c), await body(c, communitySchema)), 201));
  app.get("/communities/:slug", async (c) => ok(c, await connect.getCommunity(c.get("ctx"), requireUser(c), c.req.param("slug"))));
  app.patch("/communities/:slug", async (c) => {
    await connect.updateCommunity(c.get("ctx"), requireUser(c), c.req.param("slug"), await body(c, communityUpdateSchema));
    return ok(c, { ok: true });
  });
  app.delete("/communities/:slug", async (c) => {
    await connect.deleteCommunity(c.get("ctx"), requireUser(c), c.req.param("slug"));
    return ok(c, { ok: true });
  });
  app.post("/communities/:slug/join", async (c) => {
    await connect.join(c.get("ctx"), requireUser(c), c.req.param("slug"));
    return ok(c, { ok: true });
  });
  app.post("/communities/:slug/leave", async (c) => {
    await connect.leave(c.get("ctx"), requireUser(c), c.req.param("slug"));
    return ok(c, { ok: true });
  });
  app.post("/communities/:slug/invites", async (c) => {
    const b = await body(c, z.object({ maxUses: z.number().int().min(1).max(1000).optional(), expiresInHours: z.number().int().min(1).max(24 * 30).optional() }));
    return ok(c, await connect.createInvite(c.get("ctx"), requireUser(c), c.req.param("slug"), b), 201);
  });
  app.get("/invites/:code", async (c) => ok(c, await connect.previewInvite(c.get("ctx"), requireUser(c), c.req.param("code"))));
  app.post("/invites/:code/accept", async (c) => ok(c, await connect.acceptInvite(c.get("ctx"), requireUser(c), c.req.param("code"))));
  app.get("/communities/:slug/members", async (c) => ok(c, await connect.listMembers(c.get("ctx"), requireUser(c), c.req.param("slug"))));
  app.post("/communities/:slug/members/:userId", async (c) => {
    const action = await body(
      c,
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("role"), role: z.enum(COMMUNITY_ROLES) }),
        z.object({ type: z.literal("kick") }),
        z.object({ type: z.literal("ban"), reason: z.string().max(200).optional() }),
      ]),
    );
    await connect.moderateMember(c.get("ctx"), requireUser(c), c.req.param("slug"), c.req.param("userId"), action);
    return ok(c, { ok: true });
  });
  app.get("/communities/:slug/bans", async (c) => ok(c, await connect.listBans(c.get("ctx"), requireUser(c), c.req.param("slug"))));
  app.delete("/communities/:slug/bans/:userId", async (c) => {
    await connect.unban(c.get("ctx"), requireUser(c), c.req.param("slug"), c.req.param("userId"));
    return ok(c, { ok: true });
  });
  app.post("/communities/:slug/channels", async (c) => ok(c, { id: await connect.createChannel(c.get("ctx"), requireUser(c), c.req.param("slug"), await body(c, channelSchema)) }, 201));
  app.patch("/channels/:id", async (c) => {
    await connect.updateChannel(c.get("ctx"), requireUser(c), c.req.param("id"), await body(c, channelSchema.partial()));
    return ok(c, { ok: true });
  });
  app.delete("/channels/:id", async (c) => {
    await connect.deleteChannel(c.get("ctx"), requireUser(c), c.req.param("id"));
    return ok(c, { ok: true });
  });

  const before = (v: string | undefined) => (v && /^\d{1,15}$/.test(v) ? Number(v) : null);
  for (const [prefix, make] of [["channels", ch], ["conversations", cv]] as const) {
    app.get(`/${prefix}/:id/messages`, async (c) => ok(c, await connect.listMessages(c.get("ctx"), requireUser(c), make(c.req.param("id")), before(c.req.query("before")))));
    app.post(`/${prefix}/:id/messages`, async (c) => {
      const b = await body(c, messageSchema);
      return ok(c, await connect.sendMessage(c.get("ctx"), requireUser(c), make(c.req.param("id")), b.body, b.replyTo), 201);
    });
    app.get(`/${prefix}/:id/pins`, async (c) => ok(c, await connect.pinnedMessages(c.get("ctx"), requireUser(c), make(c.req.param("id")))));
    app.get(`/${prefix}/:id/search`, async (c) => ok(c, await connect.searchMessages(c.get("ctx"), requireUser(c), make(c.req.param("id")), (c.req.query("q") ?? "").slice(0, 64))));
    app.post(`/${prefix}/:id/read`, async (c) => {
      await connect.markRead(c.get("ctx"), requireUser(c), make(c.req.param("id")));
      return ok(c, { ok: true });
    });
  }
  app.patch("/messages/:id", async (c) => ok(c, await connect.editMessage(c.get("ctx"), requireUser(c), c.req.param("id"), (await body(c, messageSchema.pick({ body: true }))).body)));
  app.delete("/messages/:id", async (c) => {
    await connect.deleteMessage(c.get("ctx"), requireUser(c), c.req.param("id"));
    return ok(c, { ok: true });
  });
  app.post("/messages/:id/pin", async (c) => ok(c, await connect.pinMessage(c.get("ctx"), requireUser(c), c.req.param("id"), (await body(c, z.object({ pinned: z.boolean() }))).pinned)));
  app.post("/messages/:id/reactions", async (c) => ok(c, await connect.toggleReaction(c.get("ctx"), requireUser(c), c.req.param("id"), (await body(c, z.object({ emoji: z.string().min(1).max(16) }))).emoji)));

  app.get("/conversations", async (c) => ok(c, await connect.listConversations(c.get("ctx"), requireUser(c))));
  app.post("/conversations", async (c) => {
    const b = await body(c, conversationSchema);
    return ok(c, await connect.createConversation(c.get("ctx"), requireUser(c), b.usernames, b.title), 201);
  });
  app.get("/conversations/:id", async (c) => ok(c, await connect.getConversation(c.get("ctx"), requireUser(c), c.req.param("id"))));
  app.post("/conversations/:id/leave", async (c) => {
    await connect.leaveConversation(c.get("ctx"), requireUser(c), c.req.param("id"));
    return ok(c, { ok: true });
  });

  // Voice/video: only available once a real media backend is configured. Never simulated.
  app.get("/voice/status", (c) => {
    requireUser(c);
    const configured = !!(c.env.REALTIME_APP_ID && c.env.REALTIME_APP_TOKEN);
    return ok(c, {
      available: false,
      configured,
      reason: configured
        ? "Media credentials are configured, but the calling client is not built yet (Milestone 5)."
        : "Voice, video and screen sharing need a WebRTC SFU and TURN relay. None is configured for this installation.",
      requirements: [
        "A WebRTC SFU (e.g. Cloudflare Realtime SFU) — a WebSocket server cannot relay media.",
        "A TURN service for users behind strict NATs.",
        "Secrets REALTIME_APP_ID and REALTIME_APP_TOKEN set on the Worker.",
        "Cloudflare Realtime includes 1,000 GB/month free egress (SFU + TURN combined), then $0.05/GB — see FREE_TIER_AUDIT.md.",
      ],
    });
  });

  // Realtime: authorise, then hand the WebSocket to the room's Durable Object.
  app.get("/realtime", async (c) => {
    const v = requireUser(c);
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") throw new AppError("bad_request", "Expected a WebSocket upgrade.");
    // Browsers send Origin on WebSocket handshakes; reject cross-site sockets.
    const origin = c.req.header("origin");
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (!origin || !host || new URL(origin).host !== host) throw new AppError("forbidden", "Cross-site WebSocket blocked.");
    const room = await connect.authoriseRoom(c.get("ctx"), v, c.req.query("room") ?? "");
    const stub = c.env.REALTIME.get(c.env.REALTIME.idFromName(room));
    const headers = new Headers(c.req.raw.headers);
    headers.set("x-sx-user-id", v.id);
    headers.set("x-sx-username", v.username);
    // Honour the "Show activity" privacy setting: hidden users don't appear in presence.
    const prof = await one<{ show_activity: number }>(c.get("ctx").db, `SELECT show_activity FROM profiles WHERE user_id = ?`, v.id);
    if (prof && !prof.show_activity) headers.set("x-sx-hidden", "1");
    return stub.fetch(new Request(c.req.url, { headers }));
  });
}
