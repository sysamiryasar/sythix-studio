import { buildApi } from "@worker/api";
import { resetMigrationState } from "@worker/lib/migrate";
import type { Env } from "@worker/env";
import { createD1 } from "./d1";
import { createR2 } from "./r2";

export interface Published {
  room: string;
  event: { type: string; [k: string]: unknown };
}

/** Fake Durable Object namespace that records broadcasts. */
function createRealtime(published: Published[]) {
  return {
    idFromName: (name: string) => ({ name }),
    get: (id: { name: string }) => ({
      broadcast: async (payload: string) => {
        published.push({ room: id.name, event: JSON.parse(payload) });
        return 0;
      },
      fetch: async () => new Response("ws", { status: 200 }),
    }),
  };
}

export function createTestApp(env: Partial<Env> = {}) {
  resetMigrationState();
  const db = createD1();
  const media = createR2();
  const published: Published[] = [];
  const fullEnv = { DB: db, MEDIA: media, REALTIME: createRealtime(published), APP_ENV: "test", ...env } as unknown as Env;
  const app = buildApi();
  const fetchApi = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("host", "unite.test");
    if (init.method && init.method !== "GET" && !headers.has("origin")) headers.set("origin", "http://unite.test");
    return app.request(`http://unite.test/api${path}`, { ...init, headers }, fullEnv);
  };
  return { app, db, media, env: fullEnv, published, fetchApi };
}

export type TestApp = ReturnType<typeof createTestApp>;

/** A signed-in client with its own cookie. */
let ipSeq = 0;
export class Client {
  cookie = "";
  ip = `198.51.100.${(ipSeq++ % 250) + 1}`;
  constructor(
    readonly t: TestApp,
    readonly username = "",
  ) {}

  async req<T = unknown>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; data: T; error?: { code: string; message: string } }> {
    const headers: Record<string, string> = { "cf-connecting-ip": this.ip, ...extraHeaders };
    if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) {
      payload = body as BodyInit;
      headers["content-type"] = "application/octet-stream";
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    const res = await this.t.fetchApi(path, { method, headers, body: payload });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0]!;
    const text = await res.text();
    let json: { data?: T; error?: { code: string; message: string } } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* binary */
    }
    return { status: res.status, data: json.data as T, error: json.error };
  }

  get = <T = unknown>(p: string) => this.req<T>("GET", p);
  post = <T = unknown>(p: string, b?: unknown) => this.req<T>("POST", p, b ?? {});
  put = <T = unknown>(p: string, b?: unknown) => this.req<T>("PUT", p, b ?? {});
  patch = <T = unknown>(p: string, b?: unknown) => this.req<T>("PATCH", p, b ?? {});
  del = <T = unknown>(p: string) => this.req<T>("DELETE", p);
}

let n = 0;
export async function signUp(t: TestApp, username?: string): Promise<Client> {
  n++;
  const name = username ?? `user${n}`;
  const c = new Client(t, name);
  const r = await c.post("/auth/register", { email: `${name.toLowerCase()}@example.com`, username: name, displayName: name, password: "correct horse battery" });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.error)}`);
  return c;
}
