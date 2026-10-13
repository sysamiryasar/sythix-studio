// Bindings and variables available to the Worker. Keep in sync with wrangler.jsonc
// (regenerate a full version with `pnpm cf:typegen` if bindings change).
interface CloudflareEnv {
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  APP_ENV: "development" | "staging" | "production" | "test";
  APP_URL: string;
  TURNSTILE_SECRET_KEY?: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  PLATFORM_OWNER_EMAILS?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
}
