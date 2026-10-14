import type { ProjectContent, ItemRecord } from "../content";
import type { TargetVersion } from "../versions";
import { ATTRIBUTES, getMaterial } from "../catalog";

export type FileMap = Map<string, Uint8Array>;
const enc = new TextEncoder();

export function putJson(files: FileMap, path: string, value: unknown): void {
  files.set(path, enc.encode(JSON.stringify(value, null, 2) + "\n"));
}
export function putText(files: FileMap, path: string, text: string): void {
  files.set(path, enc.encode(text));
}

/** FNV-1a 32-bit; used for deterministic ids (not for security). */
export function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Deterministic UUID as the int-array form used by 1.20.6 attribute modifiers. */
export function uuidIntArray(seed: string): [number, number, number, number] {
  return [fnv1a(seed, 1), fnv1a(seed, 2), fnv1a(seed, 3), fnv1a(seed, 4)].map((n) => n | 0) as [number, number, number, number];
}

export function hasVisual(item: ItemRecord): boolean {
  return !!item.texture_asset_id || !!item.data.modelAssetId;
}

/** Stable custom_model_data numbers for pre-1.21.4 targets, shared by both packs. */
export function customModelDataFor(c: ProjectContent): Map<string, number> {
  const base = 1_000_000 + (fnv1a(c.project.namespace) % 1000) * 1000;
  const map = new Map<string, number>();
  c.items
    .filter(hasVisual)
    .map((i) => i.identifier)
    .sort()
    .forEach((id, idx) => map.set(id, base + idx + 1));
  return map;
}

export function attributeId(target: TargetVersion, attr: string): string {
  return `minecraft:${target.genericAttributePrefix ? "generic." : ""}${attr}`;
}

/** Converts the editor's tooltip value to a modifier amount (weapon stats are relative to the player's base). */
export function modifierAmount(attr: string, value: number, operation: string): number {
  const def = ATTRIBUTES.find((a) => a.id === attr);
  const amount = operation === "add_value" && def?.displayBase !== undefined ? value - def.displayBase : value;
  return Math.round(amount * 1000) / 1000;
}

export function textComponent(text: string, color?: string, italic?: boolean): Record<string, unknown> {
  const t: Record<string, unknown> = { text };
  if (color) t.color = color;
  if (italic !== undefined) t.italic = italic;
  return t;
}

export function isStackable(item: ItemRecord): boolean {
  return getMaterial(item.base_material)?.stackable ?? false;
}
