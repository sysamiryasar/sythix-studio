import type { Ctx } from "../env";
import { LIMITS } from "@shared/schemas";
import { one, run } from "../lib/db";
import { AppError, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { enforce, LIMIT } from "../lib/rate-limit";
import { getStorage, requireStorage } from "../lib/storage";

export interface Sniffed {
  kind: "image" | "video";
  contentType: string;
  width: number | null;
  height: number | null;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    const len = u16be(b, o + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: u16be(b, o + 5), w: u16be(b, o + 7) };
    o += 2 + len;
  }
  return null;
}

/**
 * Identifies uploads from their bytes. The client's filename and MIME type are
 * never trusted. Only these formats are accepted; SVG/HTML are rejected outright.
 */
export function sniff(b: Uint8Array): Sniffed | null {
  if (b.length < 16) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { kind: "image", contentType: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const s = jpegSize(b);
    return { kind: "image", contentType: "image/jpeg", width: s?.w ?? null, height: s?.h ?? null };
  }
  if (ascii(b, 0, 4) === "GIF8") return { kind: "image", contentType: "image/gif", width: u16le(b, 6), height: u16le(b, 8) };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    let w: number | null = null;
    let h: number | null = null;
    if (chunk === "VP8X" && b.length >= 30) {
      w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    } else if (chunk === "VP8 " && b.length >= 30) {
      w = u16le(b, 26) & 0x3fff;
      h = u16le(b, 28) & 0x3fff;
    } else if (chunk === "VP8L" && b.length >= 25) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      w = (bits & 0x3fff) + 1;
      h = ((bits >> 14) & 0x3fff) + 1;
    }
    return { kind: "image", contentType: "image/webp", width: w, height: h };
  }
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (/^(isom|iso2|mp41|mp42|avc1|dash|M4V )$/.test(brand)) return { kind: "video", contentType: "video/mp4", width: null, height: null };
    return null;
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", contentType: "video/webm", width: null, height: null };
  return null;
}

export async function upload(ctx: Ctx, userId: string, bytes: Uint8Array) {
  const storage = requireStorage(ctx.env);
  await enforce(ctx, LIMIT.upload, userId);
  const s = sniff(bytes);
  if (!s) throw new AppError("unsupported_media", "Upload a PNG, JPEG, GIF or WebP image, or an MP4/WebM video.");
  const max = s.kind === "image" ? LIMITS.imageBytes : LIMITS.videoBytes;
  if (bytes.byteLength > max) throw new AppError("payload_too_large", `${s.kind === "image" ? "Images" : "Videos"} can be at most ${Math.round(max / 1024 / 1024)} MB.`);
  if (s.width && s.height && (s.width > 12000 || s.height > 12000)) throw new AppError("bad_request", "Image dimensions are too large.");
  const id = newId("med");
  const key = `media/${userId}/${id}`;
  await storage.put(key, bytes, s.contentType);
  await run(
    ctx.db,
    `INSERT INTO media (id, owner_id, kind, r2_key, content_type, size_bytes, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    s.kind,
    key,
    s.contentType,
    bytes.byteLength,
    s.width,
    s.height,
    ctx.now(),
  );
  return { id, kind: s.kind, url: `/api/media/${id}`, width: s.width, height: s.height };
}

export async function setAvatar(ctx: Ctx, userId: string, bytes: Uint8Array) {
  const storage = requireStorage(ctx.env);
  await enforce(ctx, LIMIT.upload, userId);
  const s = sniff(bytes);
  if (!s || s.kind !== "image") throw new AppError("unsupported_media", "Avatars must be PNG, JPEG, GIF or WebP images.");
  if (bytes.byteLength > LIMITS.avatarBytes) throw new AppError("payload_too_large", "Avatars can be at most 2 MB.");
  const prev = await one<{ avatar_key: string | null }>(ctx.db, `SELECT avatar_key FROM profiles WHERE user_id = ?`, userId);
  const key = `avatars/${userId}/${newId("ava")}.${s.contentType.split("/")[1]}`;
  await storage.put(key, bytes, s.contentType);
  await run(ctx.db, `UPDATE profiles SET avatar_key = ? WHERE user_id = ?`, key, userId);
  if (prev?.avatar_key) ctx.waitUntil(storage.delete([prev.avatar_key]));
}

export async function clearAvatar(ctx: Ctx, userId: string) {
  const prev = await one<{ avatar_key: string | null }>(ctx.db, `SELECT avatar_key FROM profiles WHERE user_id = ?`, userId);
  await run(ctx.db, `UPDATE profiles SET avatar_key = NULL WHERE user_id = ?`, userId);
  if (prev?.avatar_key) deleteObjects(ctx, [prev.avatar_key]);
}

/** Avatar keys end in the image subtype (png/jpeg/gif/webp); anything else is served as PNG. */
export function avatarContentType(key: string): string {
  const ext = key.split(".").pop();
  return ext && ["png", "jpeg", "gif", "webp"].includes(ext) ? `image/${ext}` : "image/png";
}

/** Best-effort background deletion of stored files. */
export function deleteObjects(ctx: Ctx, keys: string[]) {
  const storage = getStorage(ctx.env);
  if (storage && keys.length) ctx.waitUntil(storage.delete(keys).catch((err) => console.error(JSON.stringify({ level: "warn", event: "storage.delete_failed", message: (err as Error).message }))));
}

/** Streams a stored file with a fixed content type, honouring a single byte range (video seeking). */
export async function serveObject(ctx: Ctx, key: string, contentType: string, rangeHeader: string | undefined): Promise<Response> {
  const storage = requireStorage(ctx.env);
  const obj = await storage.get(key, rangeHeader);
  if (!obj) throw notFound("File");
  const headers = new Headers({
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "cache-control": "private, max-age=3600",
    "accept-ranges": "bytes",
  });
  if (obj.contentRange) headers.set("content-range", obj.contentRange);
  if (obj.contentLength !== undefined) headers.set("content-length", String(obj.contentLength));
  return new Response(obj.status === 416 ? null : obj.body, { status: obj.status, headers });
}

/** Daily: delete uploads never attached to a post within 24 hours. */
export async function sweepOrphans(ctx: Ctx) {
  const rows = await ctx.db
    .prepare(`SELECT id, r2_key FROM media WHERE post_id IS NULL AND created_at < ? LIMIT 500`)
    .bind(ctx.now() - 86_400_000)
    .all<{ id: string; r2_key: string }>();
  const list = rows.results ?? [];
  if (!list.length) return 0;
  const storage = getStorage(ctx.env);
  if (storage) await storage.delete(list.map((r) => r.r2_key));
  for (const r of list) await run(ctx.db, `DELETE FROM media WHERE id = ?`, r.id);
  return list.length;
}
