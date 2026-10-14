import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ensureMigrated } from "./db/migrate";

/** Everything a service needs. Services never reach for globals; they take this. */
export interface AppContext {
  db: D1Database;
  bucket: R2Bucket;
  env: CloudflareEnv;
  now: () => number;
  ip: string | null;
  userAgent: string | null;
  waitUntil: (p: Promise<unknown>) => void;
}

type ContextFactory = (req?: Request) => Promise<AppContext>;

let override: ContextFactory | null = null;

/** Tests inject an in-memory D1/R2 implementation through this hook. */
export function setContextFactoryForTests(factory: ContextFactory | null): void {
  override = factory;
}

export async function getAppContext(req?: Request): Promise<AppContext> {
  if (override) return override(req);
  const { env: rawEnv, ctx } = await getCloudflareContext({ async: true });
  await ensureMigrated(rawEnv);
  const env = withAppUrl(rawEnv, req);
  return {
    db: env.DB,
    bucket: env.ASSETS_BUCKET,
    env,
    now: () => Date.now(),
    ip: req?.headers.get("cf-connecting-ip") ?? req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req?.headers.get("user-agent")?.slice(0, 300) ?? null,
    waitUntil: (p) => ctx.waitUntil(p),
  };
}

/**
 * APP_URL is optional: when unset, the public origin is taken from the request
 * (the Host header the browser used). Without a request it stays undefined.
 */
export function withAppUrl(env: CloudflareEnv, req?: Request): CloudflareEnv {
  if (env.APP_URL || !req) return env;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return env;
  const proto = req.headers.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return { ...env, APP_URL: `${proto}://${host}` };
}

export function isProduction(env: CloudflareEnv): boolean {
  return env.APP_ENV === "production";
}
