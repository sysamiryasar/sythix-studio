import { inflateRawSync } from "node:zlib";

/** Reads one file from a ZIP/JAR buffer via the central directory. Returns null if absent or oversized. */
export function readZipEntry(buf: Buffer, wanted: (name: string) => boolean, maxBytes = 64 * 1024): { name: string; data: Buffer } | null {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    if (size > maxBytes || compSize > maxBytes) return null;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
    const lName = buf.readUInt16LE(localOffset + 26);
    const lExtra = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lName + lExtra;
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) return { name, data: Buffer.from(raw) };
    if (method === 8) return { name, data: inflateRawSync(raw, { maxOutputLength: maxBytes }) };
    return null;
  }
  return null;
}

export function listZipNames(buf: Buffer): string[] {
  const names: string[] = [];
  readZipEntry(buf, (n) => {
    names.push(n);
    return false;
  });
  return names;
}

export interface PluginInfo {
  name: string;
  version: string;
  file: string;
  apiVersion?: string;
  description?: string;
  authors?: string[];
}

/** Minimal reader for the top-level scalar keys of plugin.yml / paper-plugin.yml. */
export function parsePluginYml(text: string, file: string): PluginInfo | null {
  const get = (key: string) => {
    const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(text);
    return m ? m[1]!.trim().replace(/^['"]|['"]$/g, "") : undefined;
  };
  const name = get("name");
  if (!name) return null;
  let authors: string[] | undefined;
  const list = /^authors:\s*\[(.*)\]\s*$/m.exec(text);
  if (list) authors = list[1]!.split(",").map((a) => a.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  else if (get("author")) authors = [get("author")!];
  return { name, version: get("version") ?? "unknown", file, apiVersion: get("api-version"), description: get("description"), authors };
}
