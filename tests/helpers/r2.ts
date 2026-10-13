// Minimal in-memory R2Bucket covering the operations SythiX uses.
export function createTestR2(): R2Bucket & { objects: Map<string, { body: Uint8Array; contentType?: string; custom?: Record<string, string> }> } {
  const objects = new Map<string, { body: Uint8Array; contentType?: string; custom?: Record<string, string> }>();
  const toBytes = async (v: unknown): Promise<Uint8Array> => {
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (typeof v === "string") return new TextEncoder().encode(v);
    if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
    throw new Error("Unsupported R2 body in test bucket");
  };
  const meta = (key: string, o: { body: Uint8Array; contentType?: string; custom?: Record<string, string> }) => ({
    key,
    size: o.body.byteLength,
    httpMetadata: { contentType: o.contentType },
    customMetadata: o.custom ?? {},
    etag: key,
    uploaded: new Date(0),
  });
  const bucket = {
    objects,
    async put(key: string, value: unknown, opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
      const o = { body: await toBytes(value), contentType: opts?.httpMetadata?.contentType, custom: opts?.customMetadata };
      objects.set(key, o);
      return meta(key, o);
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        ...meta(key, o),
        body: new Response(o.body as unknown as BodyInit).body,
        arrayBuffer: async () => o.body.slice().buffer,
        text: async () => new TextDecoder().decode(o.body),
        writeHttpMetadata: (h: Headers) => o.contentType && h.set("content-type", o.contentType),
      };
    },
    async head(key: string) {
      const o = objects.get(key);
      return o ? meta(key, o) : null;
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    },
    async list(opts?: { prefix?: string }) {
      const keys = [...objects.keys()].filter((k) => !opts?.prefix || k.startsWith(opts.prefix));
      return { objects: keys.map((k) => meta(k, objects.get(k)!)), truncated: false, delimitedPrefixes: [] };
    },
  };
  return bucket as unknown as R2Bucket & typeof bucket;
}
