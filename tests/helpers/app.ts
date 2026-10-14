import { setContextFactoryForTests, type AppContext } from "@/lib/context";
import { createTestD1, applyMigrations } from "./d1";
import { createTestR2 } from "./r2";
import { register, verifyEmail, login } from "@/lib/auth/service";
import { one } from "@/lib/db/sql";
import type { SessionUser } from "@/lib/auth/session";
import { resolveSession } from "@/lib/auth/session";

export interface TestApp {
  ctx: AppContext;
  db: ReturnType<typeof createTestD1>;
  bucket: ReturnType<typeof createTestR2>;
  clock: { now: number };
  /** Builds a Request-scoped context (as the API layer does). */
  install: () => void;
}

export function createTestApp(envOverrides: Partial<CloudflareEnv> = {}): TestApp {
  const db = createTestD1();
  applyMigrations(db.sqlite);
  const bucket = createTestR2();
  const clock = { now: Date.UTC(2026, 9, 1) };
  const env = {
    APP_ENV: "test",
    APP_URL: "http://localhost:3000",
    DB: db,
    ASSETS_BUCKET: bucket,
    // Naming an owner that never registers disables first-account bootstrap,
    // so ordinary tests get ordinary members. Bootstrap has its own tests.
    PLATFORM_OWNER_EMAILS: "owner@example.invalid",
    ...envOverrides,
  } as unknown as CloudflareEnv;
  const make = (req?: Request): AppContext => ({
    db,
    bucket,
    env,
    now: () => clock.now,
    ip: req?.headers.get("cf-connecting-ip") ?? "203.0.113.1",
    userAgent: "vitest",
    waitUntil: () => {},
  });
  const ctx = make();
  return { ctx, db, bucket, clock, install: () => setContextFactoryForTests(async (req) => make(req)) };
}

let counter = 0;

/** Registers, verifies and logs in a user; returns the session user and raw session token. */
export async function createUser(app: TestApp, name?: string): Promise<{ user: SessionUser; token: string }> {
  counter++;
  // Each account is created in its own rate-limit window.
  app.clock.now += 60 * 60_000;
  const username = name ?? `player${counter}`;
  const email = `${username.toLowerCase()}@example.com`;
  const password = "correct horse battery staple";
  const { status } = await register(app.ctx, { email, username, password });
  if (status !== "first_owner_ready") {
    const tokenRow = await one<{ body_text: string }>(
      app.ctx.db,
      `SELECT body_text FROM email_outbox WHERE to_email = ? ORDER BY created_at DESC LIMIT 1`,
      email,
    );
    const verifyToken = /token=([A-Za-z0-9_-]+)/.exec(tokenRow?.body_text ?? "")?.[1];
    if (!verifyToken) throw new Error("verification email not found");
    await verifyEmail(app.ctx, verifyToken);
  }
  const { token } = await login(app.ctx, { email, password });
  const user = await resolveSession(app.ctx, token);
  if (!user) throw new Error("session did not resolve");
  return { user, token };
}
