import { z } from "zod";
import type { Hono } from "hono";
import { PRODUCT_AREAS } from "@shared/areas";
import { CHANGELOG } from "@shared/changelog";
import { PLATFORM_ROLES } from "@shared/permissions";
import { body, ok, requireUser, type AppEnv } from "../app";
import * as mod from "../services/moderation";
import { one } from "../lib/db";
import { getStorage } from "../lib/storage";

export function platformRoutes(app: Hono<AppEnv>) {
  app.get("/health", async (c) => {
    const db = await one<{ ok: number }>(c.get("ctx").db, `SELECT 1 AS ok`).catch(() => null);
    return c.json({ status: db ? "ok" : "degraded", db: !!db, time: new Date().toISOString() }, db ? 200 : 503);
  });
  app.get("/platform/areas", (c) => ok(c, PRODUCT_AREAS));
  // Public, unauthenticated: only non-secret values the sign-up form needs.
  app.get("/platform/public-config", (c) =>
    ok(c, { turnstileSiteKey: c.env.TURNSTILE_SECRET_KEY ? (c.env.TURNSTILE_SITE_KEY ?? null) : null, mediaStorage: getStorage(c.env)?.name ?? null }),
  );
  app.get("/platform/changelog", (c) => ok(c, CHANGELOG));
  app.get("/platform/setup", (c) => {
    requireUser(c);
    return ok(c, {
      turnstile: !!(c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY),
      voice: !!(c.env.REALTIME_APP_ID && c.env.REALTIME_APP_TOKEN),
      ownerEmails: !!c.env.OWNER_EMAILS,
      mediaStorage: getStorage(c.env)?.name ?? null,
      environment: c.env.APP_ENV ?? "production",
    });
  });

  app.get("/mod/reports", async (c) => {
    const status = z.enum(["open", "actioned", "dismissed"]).catch("open").parse(c.req.query("status"));
    return ok(c, await mod.listReports(c.get("ctx"), requireUser(c), status));
  });
  app.post("/mod/reports/:id", async (c) => {
    const b = await body(c, z.object({ action: z.enum(["dismiss", "remove"]), note: z.string().max(500).default("") }));
    await mod.resolveReport(c.get("ctx"), requireUser(c), c.req.param("id"), b.action, b.note);
    return ok(c, { ok: true });
  });
  app.post("/mod/posts/:id", async (c) => {
    const b = await body(c, z.object({ hidden: z.boolean() }));
    await mod.setPostHidden(c.get("ctx"), requireUser(c), c.req.param("id"), b.hidden);
    return ok(c, { ok: true });
  });
  app.get("/mod/users", async (c) => ok(c, await mod.listUsers(c.get("ctx"), requireUser(c), (c.req.query("q") ?? "").slice(0, 64))));
  app.post("/mod/users/:id/suspend", async (c) => {
    const b = await body(c, z.object({ suspended: z.boolean(), reason: z.string().max(500).default("") }));
    await mod.setSuspended(c.get("ctx"), requireUser(c), c.req.param("id"), b.suspended, b.reason);
    return ok(c, { ok: true });
  });
  app.post("/mod/users/:id/role", async (c) => {
    const b = await body(c, z.object({ role: z.enum(PLATFORM_ROLES) }));
    await mod.setRole(c.get("ctx"), requireUser(c), c.req.param("id"), b.role);
    return ok(c, { ok: true });
  });
  app.get("/mod/audit", async (c) => ok(c, await mod.auditLog(c.get("ctx"), requireUser(c))));
}
