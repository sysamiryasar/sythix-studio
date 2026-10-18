import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp, signUp } from "./helpers/app";
import type { PostView } from "@shared/types";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8, 0, 0, 0, 8, 8, 6, 0, 0, 0, 1, 2, 3, 4, 5]);

/** A tiny in-memory imitation of the Supabase Storage REST API. */
function fakeSupabase() {
  const buckets = new Set<string>();
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const calls: { method: string; path: string; headers: Record<string, string> }[] = [];
  const handler = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const path = url.pathname.replace(/^\/storage\/v1\//, "");
    calls.push({ method, path, headers });
    if (!headers.apikey) return new Response("no key", { status: 401 });
    if (method === "POST" && path === "bucket") {
      const { id } = JSON.parse(String(init.body));
      if (buckets.has(id)) return new Response(JSON.stringify({ message: "The resource already exists" }), { status: 409 });
      buckets.add(id);
      return Response.json({ name: id });
    }
    const m = /^object\/(authenticated\/)?([^/]+)\/?(.*)$/.exec(path);
    if (!m) return new Response("bad path", { status: 400 });
    const [, , bucket, key] = m as unknown as [string, string, string, string];
    if (!buckets.has(bucket!)) return new Response(JSON.stringify({ statusCode: "404", error: "Bucket not found", message: "Bucket not found" }), { status: 400 });
    const full = `${bucket}/${decodeURIComponent(key!)}`;
    if (method === "POST") {
      objects.set(full, { bytes: new Uint8Array(init.body as Uint8Array), type: headers["content-type"]! });
      return Response.json({ Key: full });
    }
    if (method === "DELETE") {
      for (const p of JSON.parse(String(init.body)).prefixes as string[]) objects.delete(`${bucket}/${p}`);
      return Response.json([]);
    }
    const o = objects.get(full);
    if (!o) return new Response(JSON.stringify({ error: "not_found" }), { status: 400 });
    const r = headers.range ? /bytes=(\d+)-(\d*)/.exec(headers.range) : null;
    if (r) {
      const start = Number(r[1]);
      const end = r[2] ? Number(r[2]) : o.bytes.length - 1;
      return new Response(o.bytes.slice(start, end + 1), { status: 206, headers: { "content-range": `bytes ${start}-${end}/${o.bytes.length}`, "content-length": String(end - start + 1) } });
    }
    return new Response(o.bytes, { status: 200, headers: { "content-length": String(o.bytes.length) } });
  };
  return { handler, buckets, objects, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("media storage", () => {
  it("works without any storage: uploads explain why they're off, everything else works", async () => {
    const t = createTestApp({ MEDIA: undefined });
    const a = await signUp(t, "NoStore");
    expect((await a.get<{ mediaStorage: string | null }>("/platform/public-config")).data.mediaStorage).toBeNull();
    const up = await a.req("POST", "/media", PNG);
    expect(up.status).toBe(503);
    expect(up.error?.message).toMatch(/aren't set up/);
    expect((await a.req("POST", "/me/avatar", PNG)).status).toBe(503);
    expect((await a.post<PostView>("/posts", { body: "text still works" })).status).toBe(201);
  });

  it("stores media in Supabase Storage: creates a private bucket, serves through the API, deletes with the post", async () => {
    const fake = fakeSupabase();
    vi.stubGlobal("fetch", fake.handler);
    const t = createTestApp({ MEDIA: undefined, SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_KEY: "sb_secret_test" });
    const a = await signUp(t, "Supa");
    expect((await a.get<{ mediaStorage: string }>("/platform/public-config")).data.mediaStorage).toBe("supabase");

    const up = await a.req<{ id: string }>("POST", "/media", PNG);
    expect(up.status).toBe(201);
    expect(fake.buckets.has("sythix-media")).toBe(true);
    expect(fake.objects.size).toBe(1);
    // New-style secret keys go only in `apikey`, never as a Bearer token.
    expect(fake.calls.every((c) => c.headers.apikey === "sb_secret_test" && !c.headers.authorization)).toBe(true);

    const p = (await a.post<PostView>("/posts", { body: "pic", mediaIds: [up.data.id] })).data;
    const res = await t.fetchApi(`/media/${up.data.id}`, { headers: { cookie: a.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    const ranged = await t.fetchApi(`/media/${up.data.id}`, { headers: { cookie: a.cookie, range: "bytes=0-3" } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe(`bytes 0-3/${PNG.length}`);

    await a.del(`/posts/${p.id}`);
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.objects.size).toBe(0);
  });

  it("stores avatars in Supabase and serves them with the right type", async () => {
    const fake = fakeSupabase();
    fake.buckets.add("custom");
    vi.stubGlobal("fetch", fake.handler);
    const t = createTestApp({ MEDIA: undefined, SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_KEY: "eyJlegacy.jwt.key", SUPABASE_BUCKET: "custom" });
    const a = await signUp(t, "AvatarUser");
    const me = (await a.req<{ id: string; avatarUrl: string }>("POST", "/me/avatar", PNG)).data;
    expect(me.avatarUrl).toMatch(/^\/api\/avatars\//);
    // Legacy JWT keys are sent as both apikey and Bearer.
    expect(fake.calls.at(-1)?.headers.authorization).toBe("Bearer eyJlegacy.jwt.key");
    const res = await t.fetchApi(me.avatarUrl.replace(/^\/api/, ""), { headers: { cookie: a.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("reports a clear error when Supabase rejects the credentials", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Invalid Compact JWS" }), { status: 403 }));
    const t = createTestApp({ MEDIA: undefined, SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_KEY: "wrong" });
    const a = await signUp(t, "BadKey");
    const r = await a.req("POST", "/media", PNG);
    expect(r.status).toBe(503);
    expect(r.error?.message).toMatch(/Check the Supabase settings/);
  });
});
