// Validation for uploaded textures (PNG) and Java Edition JSON block/item models.
// Everything is parsed from bytes; nothing is executed or rendered server-side.

export const TEXTURE_MAX_BYTES = 256 * 1024;
export const MODEL_MAX_BYTES = 64 * 1024;
export const TEXTURE_SIZES = [16, 32, 64, 128, 256, 512];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/** Reads the PNG signature and IHDR chunk. Returns null for anything that is not a well-formed PNG header. */
export function readPngInfo(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 33) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(8);
  const type = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (type !== "IHDR" || len !== 13) return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24]!;
  const colorType = bytes[25]!;
  if (!width || !height) return null;
  // The file must end with an IEND chunk (guards against truncated uploads).
  const tail = String.fromCharCode(...bytes.slice(bytes.length - 8, bytes.length - 4));
  if (tail !== "IEND") return null;
  return { width, height, bitDepth, colorType };
}

export function validateTexture(bytes: Uint8Array): { ok: true; info: PngInfo } | { ok: false; error: string } {
  if (bytes.length > TEXTURE_MAX_BYTES) return { ok: false, error: `Textures must be at most ${TEXTURE_MAX_BYTES / 1024} KB.` };
  const info = readPngInfo(bytes);
  if (!info) return { ok: false, error: "The file is not a valid PNG image." };
  if (info.width !== info.height) return { ok: false, error: "Textures must be square (animated strips are not supported yet)." };
  if (!TEXTURE_SIZES.includes(info.width)) return { ok: false, error: `Texture size must be one of ${TEXTURE_SIZES.join(", ")} pixels.` };
  return { ok: true, info };
}

const FACES = new Set(["north", "south", "east", "west", "up", "down"]);
const VANILLA_PARENTS = new Set(["item/generated", "item/handheld", "minecraft:item/generated", "minecraft:item/handheld", "block/block", "minecraft:block/block"]);
const ANGLES = new Set([-45, -22.5, 0, 22.5, 45]);

export interface ParsedModel {
  model: Record<string, unknown>;
  /** Project texture names referenced by the model. */
  textureRefs: string[];
  elementCount: number;
}

const vec3 = (v: unknown, min: number, max: number) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max);

/**
 * Validates a Java Edition model JSON. Texture values may reference project
 * textures by bare name (`blade`) or `<anything>:item/<name>`; they are
 * normalised to bare names and rewritten to the project namespace on export.
 */
export function parseModelJson(text: string): { ok: true; value: ParsedModel } | { ok: false; error: string } {
  if (text.length > MODEL_MAX_BYTES) return { ok: false, error: `Models must be at most ${MODEL_MAX_BYTES / 1024} KB.` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "A model must be a JSON object." };
  const m = raw as Record<string, unknown>;
  const allowedKeys = new Set(["parent", "textures", "elements", "display", "gui_light", "ambientocclusion", "credit", "texture_size"]);
  for (const k of Object.keys(m)) if (!allowedKeys.has(k)) return { ok: false, error: `Unsupported model property "${k}".` };
  if (m.parent !== undefined && (typeof m.parent !== "string" || !VANILLA_PARENTS.has(m.parent))) {
    return { ok: false, error: "Only vanilla item/generated, item/handheld or block/block parents are supported." };
  }

  const textures = (m.textures ?? {}) as Record<string, unknown>;
  if (typeof textures !== "object" || Array.isArray(textures)) return { ok: false, error: "\"textures\" must be an object." };
  const refs = new Set<string>();
  const normalised: Record<string, string> = {};
  for (const [key, val] of Object.entries(textures)) {
    if (typeof val !== "string" || !/^[a-z0-9_]{1,40}$/i.test(key)) return { ok: false, error: `Invalid texture entry "${key}".` };
    if (val.startsWith("#")) {
      normalised[key] = val;
      continue;
    }
    const name = val.includes(":") ? val.split(":")[1]!.replace(/^item\//, "") : val.replace(/^item\//, "");
    if (!/^[a-z0-9_]{1,40}$/.test(name)) return { ok: false, error: `Texture reference "${val}" must point to a project texture name.` };
    refs.add(name);
    normalised[key] = name;
  }

  let elementCount = 0;
  if (m.elements !== undefined) {
    if (!Array.isArray(m.elements)) return { ok: false, error: "\"elements\" must be an array." };
    if (m.elements.length > 512) return { ok: false, error: "Models can have at most 512 elements." };
    for (const [i, el] of (m.elements as Record<string, unknown>[]).entries()) {
      if (!el || typeof el !== "object") return { ok: false, error: `Element ${i} is not an object.` };
      if (!vec3(el.from, -16, 32) || !vec3(el.to, -16, 32)) return { ok: false, error: `Element ${i} needs "from"/"to" coordinates between -16 and 32.` };
      if (el.rotation !== undefined) {
        const r = el.rotation as Record<string, unknown>;
        if (!ANGLES.has(r.angle as number) || !["x", "y", "z"].includes(r.axis as string) || !vec3(r.origin, -16, 32)) {
          return { ok: false, error: `Element ${i} has an invalid rotation (angles must be -45, -22.5, 0, 22.5 or 45).` };
        }
      }
      const faces = (el.faces ?? {}) as Record<string, Record<string, unknown>>;
      for (const [face, def] of Object.entries(faces)) {
        if (!FACES.has(face)) return { ok: false, error: `Element ${i} has an unknown face "${face}".` };
        if (typeof def?.texture !== "string" || !def.texture.startsWith("#")) return { ok: false, error: `Element ${i} face ${face} must reference a texture variable like "#0".` };
        const variable = def.texture.slice(1);
        if (!(variable in normalised)) return { ok: false, error: `Element ${i} face ${face} uses undefined texture variable "${def.texture}".` };
      }
    }
    elementCount = m.elements.length;
  }
  if (!m.parent && elementCount === 0) return { ok: false, error: "A model needs either elements or a vanilla parent." };

  return { ok: true, value: { model: { ...m, textures: normalised }, textureRefs: [...refs].sort(), elementCount } };
}
