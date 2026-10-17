// Minimal in-memory R2 bucket for tests.
export function createR2() {
  const store = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const obj = (key: string, bytes: Uint8Array, contentType?: string) => ({
    key,
    size: bytes.byteLength,
    httpMetadata: { contentType },
    body: new Blob([bytes as unknown as ArrayBuffer]).stream(),
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const bucket = {
    store,
    async put(key: string, value: Uint8Array | ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      store.set(key, { bytes, contentType: opts?.httpMetadata?.contentType });
      return obj(key, bytes, opts?.httpMetadata?.contentType);
    },
    async get(key: string, opts?: { range?: { offset: number; length: number } }) {
      const v = store.get(key);
      if (!v) return null;
      const bytes = opts?.range ? v.bytes.subarray(opts.range.offset, opts.range.offset + opts.range.length) : v.bytes;
      return obj(key, bytes, v.contentType);
    },
    async head(key: string) {
      const v = store.get(key);
      return v ? obj(key, v.bytes, v.contentType) : null;
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },
  };
  return bucket as unknown as R2Bucket & { store: typeof store };
}
