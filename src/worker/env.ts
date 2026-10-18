import type { RealtimeRoom } from "./realtime/room";

export interface Env {
  DB: D1Database;
  /** Optional Cloudflare R2 bucket for media. Supabase Storage is used instead when configured. */
  MEDIA?: R2Bucket;
  /** Supabase Storage for media (free tier): project URL, secret/service-role key, bucket name. */
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_BUCKET?: string;
  ASSETS?: Fetcher;
  REALTIME: DurableObjectNamespace<RealtimeRoom>;
  APP_ENV?: string;
  /** Optional: Cloudflare Turnstile secret. Without it, sign-up is protected by rate limits only. */
  TURNSTILE_SECRET_KEY?: string;
  /** Public Turnstile site key (both keys are needed to turn the check on). */
  TURNSTILE_SITE_KEY?: string;
  /** Optional: comma-separated emails that become `owner` on sign-up. Otherwise the first account is owner. */
  OWNER_EMAILS?: string;
  /** Set to "off" to disable runtime D1 migrations. */
  AUTO_MIGRATE?: string;
  /** Optional media backend for voice/video (Cloudflare Realtime). Calls are unavailable without it. */
  REALTIME_APP_ID?: string;
  REALTIME_APP_TOKEN?: string;
}

export interface Ctx {
  env: Env;
  db: D1Database;
  now: () => number;
  ip: string | null;
  userAgent: string | null;
  waitUntil: (p: Promise<unknown>) => void;
}
