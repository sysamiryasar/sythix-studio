// Media storage adapters. The Worker never exposes storage credentials or
// direct object URLs: every download goes through the API, which authorises it.
//
// Supported backends, chosen at runtime:
//   1. Supabase Storage — set SUPABASE_URL + SUPABASE_SERVICE_KEY (default; free tier, no card)
//   2. Cloudflare R2   — add an R2 binding named MEDIA in wrangler.jsonc
// With neither configured, uploads fail with a clear "storage not set up" error
// and the rest of the app keeps working.
import type { Env } from "../env";
import { AppError } from "./errors";

export interface StoredObject {
  status: 200 | 206 | 416;
  body: ReadableStream | null;
  /** Total object size, when known. */
  size?: number;
  contentRange?: string;
  contentLength?: number;
}

export interface MediaStorage {
  readonly name: "supabase" | "r2";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** `range` is a raw HTTP Range header ("bytes=0-99"). Returns null when missing. */
  get(key: string, range?: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
}

const RANGE_RE = /^bytes=(\d+)-(\d*)$/;

// Cloudflare R2 --------------------------------------------------------------------------

function r2Storage(bucket: R2Bucket): MediaStorage {
  return {
    name: "r2",
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } });
    },
    async get(key, range) {
      const m = range ? RANGE_RE.exec(range) : null;
      if (m) {
        const head = await bucket.head(key);
        if (!head) return null;
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
        if (start > end || start >= head.size) return { status: 416, body: null, size: head.size, contentRange: `bytes */${head.size}` };
        const obj = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
        if (!obj) return null;
        return { status: 206, body: obj.body, size: head.size, contentRange: `bytes ${start}-${end}/${head.size}`, contentLength: end - start + 1 };
      }
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { status: 200, body: obj.body, size: obj.size, contentLength: obj.size };
    },
    async delete(keys) {
      if (keys.length) await bucket.delete(keys);
    },
  };
}

// Supabase Storage (REST API) --------------------------------------------------------------

export function supabaseStorage(opts: { url: string; key: string; bucket: string; fetch?: typeof fetch }): MediaStorage {
  const base = opts.url.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  // New-style secret keys (sb_secret_…) are not JWTs: send them only as `apikey`.
  // Legacy service_role keys are JWTs and go in both headers.
  const auth: Record<string, string> = opts.key.startsWith("sb_secret_") ? { apikey: opts.key } : { apikey: opts.key, authorization: `Bearer ${opts.key}` };
  const objectPath = (key: string) => `${encodeURIComponent(opts.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const call = async (path: string, init: RequestInit) => {
    try {
      return await doFetch(`${base}/storage/v1/${path}`, { ...init, headers: { ...auth, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      throw new AppError("unavailable", "Media storage is unreachable right now. Try again shortly.", { cause: (err as Error).message });
    }
  };
  const fail = async (res: Response, what: string): Promise<never> => {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    console.error(JSON.stringify({ level: "error", event: "storage.supabase_error", what, status: res.status, body: text }));
    throw new AppError("unavailable", "Media storage returned an error. Check the Supabase settings (URL, key, bucket).");
  };
  let bucketReady = false;
  const ensureBucket = async () => {
    // Creates the bucket as PRIVATE the first time; "already exists" is fine.
    const res = await call("bucket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: opts.bucket, name: opts.bucket, public: false }) });
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => "");
      if (!/already exists/i.test(text)) await fail(new Response(text, { status: res.status }), "create_bucket");
    }
    bucketReady = true;
  };

  return {
    name: "supabase",
    async put(key, bytes, contentType) {
      const upload = () => call(`object/${objectPath(key)}`, { method: "POST", headers: { "content-type": contentType, "x-upsert": "true", "cache-control": "max-age=3600" }, body: bytes });
      let res = await upload();
      if (!res.ok && !bucketReady) {
        const text = await res.text().catch(() => "");
        if (/bucket not found/i.test(text) || res.status === 404) {
          await ensureBucket();
          res = await upload();
        } else {
          await fail(new Response(text, { status: res.status }), "upload");
        }
      }
      if (!res.ok) await fail(res, "upload");
    },
    async get(key, range) {
      const headers: Record<string, string> = {};
      if (range && RANGE_RE.test(range)) headers.range = range;
      const res = await call(`object/authenticated/${objectPath(key)}`, { method: "GET", headers });
      if (res.status === 400 || res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (res.status === 416) return { status: 416, body: null, contentRange: res.headers.get("content-range") ?? undefined };
      if (!res.ok) await fail(res, "download");
      const contentRange = res.headers.get("content-range") ?? undefined;
      const len = res.headers.get("content-length");
      const total = contentRange ? Number(contentRange.split("/")[1]) : len ? Number(len) : undefined;
      return { status: res.status === 206 ? 206 : 200, body: res.body, contentRange, contentLength: len ? Number(len) : undefined, size: Number.isFinite(total) ? total : undefined };
    },
    async delete(keys) {
      if (!keys.length) return;
      const res = await call(`object/${encodeURIComponent(opts.bucket)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: keys }) });
      if (!res.ok) await fail(res, "delete");
    },
  };
}

// Selection -------------------------------------------------------------------------------

const cache = new WeakMap<object, MediaStorage | null>();

export function getStorage(env: Env): MediaStorage | null {
  if (cache.has(env)) return cache.get(env)!;
  let s: MediaStorage | null = null;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    s = supabaseStorage({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY, bucket: env.SUPABASE_BUCKET || "sythix-media" });
  } else if (env.MEDIA) {
    s = r2Storage(env.MEDIA);
  }
  cache.set(env, s);
  return s;
}

export function requireStorage(env: Env): MediaStorage {
  const s = getStorage(env);
  if (!s) throw new AppError("unavailable", "Photo and video uploads aren't set up on this installation yet. The platform owner needs to connect media storage.");
  return s;
}
