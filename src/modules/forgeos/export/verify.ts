import type { TargetVersion } from "../versions";
import type { FileMap } from "./common";

const dec = new TextDecoder();

/**
 * Re-reads generated output and checks it is internally consistent before it
 * is offered for download: every JSON parses, pack formats match the target,
 * and every model/texture/loot reference resolves inside the pack.
 */
export function verifyPack(kind: "datapack" | "resourcepack", files: FileMap, t: TargetVersion, ns: string): string[] {
  const errors: string[] = [];
  const json = new Map<string, unknown>();
  for (const [path, bytes] of files) {
    if (path.includes("..") || path.startsWith("/")) errors.push(`Unsafe path ${path}`);
    if (path.endsWith(".json") || path.endsWith(".mcmeta")) {
      try {
        json.set(path, JSON.parse(dec.decode(bytes)));
      } catch {
        errors.push(`${path} is not valid JSON`);
      }
    }
  }
  const meta = json.get("pack.mcmeta") as { pack?: { pack_format?: number } } | undefined;
  const expected = kind === "datapack" ? t.datapackFormat : t.resourcePackFormat;
  if (meta?.pack?.pack_format !== expected) errors.push(`pack.mcmeta pack_format should be ${expected}`);

  const resolve = (ref: string, folder: string, ext: string) => {
    const [n, p] = ref.includes(":") ? ref.split(":") : ["minecraft", ref];
    return `assets/${n}/${folder}/${p}${ext}`;
  };

  if (kind === "resourcepack") {
    for (const [path, value] of json) {
      if (path.startsWith(`assets/${ns}/models/`)) {
        for (const tex of Object.values(((value as { textures?: Record<string, string> }).textures ?? {}) as Record<string, string>)) {
          if (tex.startsWith("#") || tex.startsWith("minecraft:")) continue;
          if (!files.has(resolve(tex, "textures", ".png"))) errors.push(`${path} references missing texture ${tex}`);
        }
      }
      if (path.startsWith(`assets/${ns}/items/`)) {
        const ref = (value as { model?: { model?: string } }).model?.model;
        if (!ref || !files.has(resolve(ref, "models", ".json"))) errors.push(`${path} references missing model ${ref}`);
      }
      if (path.startsWith("assets/minecraft/models/item/")) {
        for (const o of ((value as { overrides?: { model: string }[] }).overrides ?? [])) {
          if (!files.has(resolve(o.model, "models", ".json"))) errors.push(`${path} override references missing model ${o.model}`);
        }
      }
    }
  } else {
    const lootDir = t.pluralDataFolders ? "loot_tables" : "loot_table";
    for (const [path, bytes] of files) {
      if (!path.endsWith(".mcfunction")) continue;
      for (const m of dec.decode(bytes).matchAll(/loot give @s loot ([a-z0-9_]+):([a-z0-9_/]+)/g)) {
        if (!files.has(`data/${m[1]}/${lootDir}/${m[2]}.json`)) errors.push(`${path} references missing loot table ${m[1]}:${m[2]}`);
      }
    }
  }
  return errors;
}
