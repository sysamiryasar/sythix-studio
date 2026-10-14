import { describe, expect, it, beforeEach } from "vitest";
import { createTestApp, createUser, type TestApp } from "./helpers/app";
import { makePng } from "./helpers/png";
import { createProject, listRevisions, restoreRevision, duplicateProject, requireProject } from "@/modules/forgeos/projects";
import { upsertItem, upsertAbility, upsertSet } from "@/modules/forgeos/entities";
import { uploadAsset } from "@/modules/forgeos/assets";
import { loadProjectContent } from "@/modules/forgeos/content";
import { validateContent } from "@/modules/forgeos/validate";
import { buildExport, runExport } from "@/modules/forgeos/export";
import { readZip } from "@/modules/forgeos/export/zip";
import { parseModelJson, validateTexture } from "@/modules/forgeos/models";
import type { ItemInput } from "@/modules/forgeos/schema";
import { listUserWorkspaces } from "@/lib/authz/check";
import { all, one } from "@/lib/db/sql";

let app: TestApp;
beforeEach(() => {
  app = createTestApp();
});

const dec = new TextDecoder();
const json = (files: Map<string, Uint8Array>, p: string) => {
  const f = files.get(p);
  if (!f) throw new Error(`missing ${p}; have ${[...files.keys()].join(", ")}`);
  return JSON.parse(dec.decode(f));
};

const sword = (over: Partial<ItemInput> = {}): ItemInput => ({
  identifier: "storm_blade",
  name: "Storm Blade",
  baseMaterial: "diamond_sword",
  rarity: "epic",
  textureAssetId: null,
  data: {
    lore: [{ text: "Forged in thunder", color: "#22d3ee" }],
    glint: true,
    unbreakable: false,
    durability: 2000,
    attributes: [
      { attribute: "attack_damage", value: 9, slot: "mainhand", operation: "add_value" },
      { attribute: "attack_speed", value: 1.6, slot: "mainhand", operation: "add_value" },
    ],
    enchantments: [{ id: "sharpness", level: 3 }],
    consumeEffects: [],
    abilityIds: [],
    onHitEffects: [],
    recipe: { pattern: [" D ", " D ", " S "], key: { D: "diamond", S: "stick" } },
  },
  ...over,
});

async function setup(target = "1.21.4") {
  const { user } = await createUser(app, "Forger");
  const ws = (await listUserWorkspaces(app.ctx, user.id))[0]!;
  const project = await createProject(app.ctx, user, ws.id, { name: "Thunder Arsenal", description: "", targetVersion: target, folder: "", visibility: "private", namespace: "thunder" });
  return { user, ws, project };
}

describe("asset validation", () => {
  it("accepts real square PNGs and rejects spoofed or malformed files", () => {
    expect(validateTexture(makePng(16)).ok).toBe(true);
    expect(validateTexture(makePng(16, 32)).ok).toBe(false);
    expect(validateTexture(makePng(20)).ok).toBe(false);
    expect(validateTexture(new TextEncoder().encode("<svg onload=alert(1)>")).ok).toBe(false);
    const truncated = makePng(16).slice(0, 40);
    expect(validateTexture(truncated).ok).toBe(false);
  });

  it("validates model JSON structure and texture references", () => {
    const ok = parseModelJson(JSON.stringify({ textures: { "0": "blade", particle: "#0" }, elements: [{ from: [7, 0, 7], to: [9, 16, 9], faces: { north: { texture: "#0" } } }] }));
    expect(ok.ok && ok.value.textureRefs).toEqual(["blade"]);
    expect(parseModelJson("{not json").ok).toBe(false);
    expect(parseModelJson(JSON.stringify({ elements: [{ from: [0, 0, 0], to: [99, 1, 1], faces: {} }] })).ok).toBe(false);
    expect(parseModelJson(JSON.stringify({ textures: { "0": "a" }, elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { north: { texture: "#9" } } }] })).ok).toBe(false);
    expect(parseModelJson(JSON.stringify({ parent: "https://evil/x" })).ok).toBe(false);
    expect(parseModelJson(JSON.stringify({ textures: { "0": "../../etc/passwd" }, parent: "item/generated" })).ok).toBe(false);
  });
});

describe("authorization", () => {
  it("non-members cannot see or edit a workspace's projects", async () => {
    const { project } = await setup();
    const { user: outsider } = await createUser(app, "Outsider");
    await expect(requireProject(app.ctx, outsider, project.id, "project.view")).rejects.toMatchObject({ code: "not_found" });
    await expect(upsertItem(app.ctx, outsider, project.id, sword())).rejects.toMatchObject({ code: "not_found" });
  });

  it("read-only workspace members cannot edit", async () => {
    const { project, ws } = await setup();
    const { user: viewer } = await createUser(app, "ViewerOnly");
    app.db.sqlite.prepare(`INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, 'workspace_member', 0)`).run(ws.id, viewer.id);
    await requireProject(app.ctx, viewer, project.id, "project.view");
    await expect(upsertItem(app.ctx, viewer, project.id, sword())).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("validation", () => {
  it("flags broken recipes, missing abilities and consumable misuse", async () => {
    const { user, project } = await setup();
    await upsertItem(app.ctx, user, project.id, sword({ data: { ...sword().data, recipe: { pattern: ["DD", "D"], key: { D: "diamond", X: "stick" } }, abilityIds: ["ghost"], consumeEffects: [{ effect: "speed", amplifier: 0, durationTicks: 100 }] } }));
    const r = validateContent((await loadProjectContent(app.ctx, project.id))!);
    expect(r.ok).toBe(false);
    const msgs = r.issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/same width/);
    expect(msgs).toMatch(/Ability "ghost" does not exist/);
    expect(msgs).toMatch(/consumable base items/);
    expect(msgs).toMatch(/defined but unused/);
  });

  it("marks abilities and set bonuses as runtime-only, never as vanilla features", async () => {
    const { user, project } = await setup();
    await upsertAbility(app.ctx, user, project.id, { identifier: "thunder_dash", name: "Dash", template: "dash", trigger: "right_click", cooldownTicks: 60, params: { distance: 6 } });
    await upsertItem(app.ctx, user, project.id, sword({ data: { ...sword().data, abilityIds: ["thunder_dash"] } }));
    const r = validateContent((await loadProjectContent(app.ctx, project.id))!);
    expect(r.ok).toBe(true);
    expect(r.support.runtimeOnly.join()).toMatch(/thunder_dash/);
    expect(r.support.datapack.join()).not.toMatch(/\babilit/);
    expect(r.issues.some((i) => i.message.includes("not yet available"))).toBe(true);
  });

  it("rejects invalid ability parameters at save time", async () => {
    const { user, project } = await setup();
    await expect(upsertAbility(app.ctx, user, project.id, { identifier: "bad", name: "Bad", template: "dash", trigger: "right_click", cooldownTicks: 10, params: { distance: 999 } })).rejects.toBeTruthy();
  });

  it("validates equipment set pieces are distinct armor slots", async () => {
    const { user, project } = await setup();
    await upsertItem(app.ctx, user, project.id, sword({ identifier: "helm", name: "Helm", baseMaterial: "iron_helmet", data: { ...sword().data, attributes: [], recipe: undefined, enchantments: [] } }));
    await upsertItem(app.ctx, user, project.id, sword({ identifier: "helm2", name: "Helm 2", baseMaterial: "diamond_helmet", data: { ...sword().data, attributes: [], recipe: undefined, enchantments: [] } }));
    await upsertSet(app.ctx, user, project.id, { identifier: "storm_set", name: "Storm", data: { pieces: ["helm", "helm2"], bonuses: [{ piecesRequired: 2, effects: [{ type: "potion", effect: "speed", amplifier: 0 }], conditions: [] }] } });
    const r = validateContent((await loadProjectContent(app.ctx, project.id))!);
    expect(r.issues.some((i) => i.severity === "error" && /head slot/.test(i.message))).toBe(true);
  });
});

describe("exports", () => {
  async function exportFiles(target: string, withTexture = true) {
    const { user, project } = await setup(target);
    let textureId: string | null = null;
    if (withTexture) textureId = (await uploadAsset(app.ctx, user, project.id, "texture", "storm_blade", makePng(16))).id;
    await upsertItem(app.ctx, user, project.id, sword({ textureAssetId: textureId }));
    const c = (await loadProjectContent(app.ctx, project.id))!;
    const textures = new Map<string, Uint8Array>(textureId ? [[textureId, makePng(16)]] : []);
    const dp = await buildExport(c, "datapack", textures, 1);
    const rp = await buildExport(c, "resourcepack", textures, 1);
    expect(dp.verifyErrors).toEqual([]);
    expect(rp.verifyErrors).toEqual([]);
    return { dp: readZip(dp.zip), rp: readZip(rp.zip), c, textures, user, project, dpZip: dp.zip };
  }

  it("1.21.4: singular folders, unprefixed attributes, item_model + items definition, string ingredients", async () => {
    const { dp, rp } = await exportFiles("1.21.4");
    expect(json(dp, "pack.mcmeta").pack.pack_format).toBe(61);
    expect(json(rp, "pack.mcmeta").pack.pack_format).toBe(46);
    const loot = json(dp, "data/thunder/loot_table/items/storm_blade.json");
    const fns = loot.pools[0].entries[0].functions;
    const attrs = fns.find((f: { function: string }) => f.function === "minecraft:set_attributes");
    expect(attrs.modifiers[0]).toMatchObject({ attribute: "minecraft:attack_damage", amount: 8, id: "thunder:storm_blade_attack_damage_mainhand" });
    expect(attrs.modifiers[1].amount).toBeCloseTo(-2.4);
    const comps = fns.find((f: { function: string }) => f.function === "minecraft:set_components").components;
    expect(comps["minecraft:item_model"]).toBe("thunder:storm_blade");
    expect(comps["minecraft:max_damage"]).toBe(2000);
    const recipe = json(dp, "data/thunder/recipe/storm_blade.json");
    expect(recipe.key).toEqual({ D: "minecraft:diamond", S: "minecraft:stick" });
    expect(recipe.result.components["minecraft:enchantments"]).toEqual({ levels: { "minecraft:sharpness": 3 } });
    expect(typeof recipe.result.components["minecraft:item_name"]).toBe("string");
    expect(dec.decode(dp.get("data/thunder/function/give/storm_blade.mcfunction")!)).toContain("loot give @s loot thunder:items/storm_blade");
    expect(json(rp, "assets/thunder/items/storm_blade.json").model.model).toBe("thunder:item/storm_blade");
    expect(json(rp, "assets/thunder/models/item/storm_blade.json")).toEqual({ parent: "minecraft:item/handheld", textures: { layer0: "thunder:item/storm_blade" } });
    expect(rp.has("assets/thunder/textures/item/storm_blade.png")).toBe(true);
  });

  it("1.21.5: flat enchantments, list attribute modifiers and inline text components", async () => {
    const { dp } = await exportFiles("1.21.5");
    expect(json(dp, "pack.mcmeta").pack.pack_format).toBe(71);
    const recipe = json(dp, "data/thunder/recipe/storm_blade.json");
    expect(recipe.result.components["minecraft:enchantments"]).toEqual({ "minecraft:sharpness": 3 });
    expect(Array.isArray(recipe.result.components["minecraft:attribute_modifiers"])).toBe(true);
    expect(recipe.result.components["minecraft:item_name"]).toEqual({ text: "Storm Blade" });
  });

  it("1.21.1: generic. attributes, {item} ingredients and custom_model_data overrides that agree across packs", async () => {
    const { dp, rp } = await exportFiles("1.21.1");
    const loot = json(dp, "data/thunder/loot_table/items/storm_blade.json");
    const fns = loot.pools[0].entries[0].functions;
    expect(fns.find((f: { function: string }) => f.function === "minecraft:set_attributes").modifiers[0].attribute).toBe("minecraft:generic.attack_damage");
    const cmd = fns.find((f: { function: string }) => f.function === "minecraft:set_components").components["minecraft:custom_model_data"];
    expect(Number.isInteger(cmd)).toBe(true);
    expect(json(dp, "data/thunder/recipe/storm_blade.json").key.D).toEqual({ item: "minecraft:diamond" });
    const override = json(rp, "assets/minecraft/models/item/diamond_sword.json");
    expect(override.overrides[0]).toEqual({ predicate: { custom_model_data: cmd }, model: "thunder:item/storm_blade" });
    expect(rp.has("assets/thunder/items/storm_blade.json")).toBe(false);
  });

  it("1.20.6: plural data folders and name-based modifiers", async () => {
    const { dp } = await exportFiles("1.20.6");
    expect(json(dp, "pack.mcmeta").pack.pack_format).toBe(41);
    expect(dp.has("data/thunder/loot_tables/items/storm_blade.json")).toBe(true);
    expect(dp.has("data/thunder/functions/give_all.mcfunction")).toBe(true);
    expect(dp.has("data/thunder/recipes/storm_blade.json")).toBe(true);
    const recipe = json(dp, "data/thunder/recipes/storm_blade.json");
    expect(recipe.result.components["minecraft:attribute_modifiers"].modifiers[0]).toHaveProperty("uuid");
  });

  it("is byte-for-byte deterministic and includes a hashed manifest", async () => {
    const { c, textures, dpZip } = await exportFiles("1.21.4");
    const again = await buildExport(c, "datapack", textures, 1);
    expect(Buffer.from(again.zip).equals(Buffer.from(dpZip))).toBe(true);
    const manifest = json(readZip(dpZip), "sythix-manifest.json");
    expect(manifest.files.some((f: { path: string; sha256: string }) => f.path === "pack.mcmeta" && f.sha256.length === 64)).toBe(true);
    expect(JSON.stringify(manifest)).not.toMatch(/generatedAt|Date/);
  });

  it("refuses to export when validation has blocking errors", async () => {
    const { user, project } = await setup();
    await upsertItem(app.ctx, user, project.id, sword({ data: { ...sword().data, recipe: { pattern: ["X"], key: {} } } }));
    const res = await runExport(app.ctx, user, project.id, "datapack");
    expect(res.status).toBe("failed");
    expect(res.errors.join()).toMatch(/Recipe symbol "X"/);
    expect(app.bucket.objects.size).toBe(0);
  });

  it("runExport stores the zip in R2, pins a revision and awards first_export", async () => {
    const { user, project } = await setup();
    const t = await uploadAsset(app.ctx, user, project.id, "texture", "storm_blade", makePng(32));
    await upsertItem(app.ctx, user, project.id, sword({ textureAssetId: t.id }));
    const res = await runExport(app.ctx, user, project.id, "bundle");
    expect(res.status).toBe("succeeded");
    expect(res.revision).toBe(1);
    const stored = [...app.bucket.objects.keys()].find((k) => k.startsWith("exports/"))!;
    const files = readZip(app.bucket.objects.get(stored)!.body);
    expect(files.has("datapacks/thunder-datapack.zip")).toBe(true);
    expect(files.has("resourcepacks/thunder-resourcepack.zip")).toBe(true);
    expect(json(files, "sythix-runtime.json").status).toMatch(/planned/);
    expect(await one(app.ctx.db, `SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = 'first_export'`, user.id)).not.toBeNull();
    // Exporting unchanged content reuses the revision.
    expect((await runExport(app.ctx, user, project.id, "datapack")).revision).toBe(1);
  });
});

describe("revisions and duplication", () => {
  it("restores a previous revision", async () => {
    const { user, project } = await setup();
    await upsertItem(app.ctx, user, project.id, sword());
    await runExport(app.ctx, user, project.id, "datapack");
    await upsertItem(app.ctx, user, project.id, sword({ identifier: "second", name: "Second" }));
    await runExport(app.ctx, user, project.id, "datapack");
    expect((await listRevisions(app.ctx, project.id)).length).toBe(2);
    await restoreRevision(app.ctx, user, project.id, 1);
    const items = await all<{ identifier: string }>(app.ctx.db, `SELECT identifier FROM items WHERE project_id = ?`, project.id);
    expect(items.map((i) => i.identifier)).toEqual(["storm_blade"]);
  });

  it("duplicates content and asset files", async () => {
    const { user, project } = await setup();
    const t = await uploadAsset(app.ctx, user, project.id, "texture", "storm_blade", makePng(16));
    await upsertItem(app.ctx, user, project.id, sword({ textureAssetId: t.id }));
    const copy = await duplicateProject(app.ctx, user, project.id);
    const c = (await loadProjectContent(app.ctx, copy.id))!;
    expect(c.items[0]!.texture_asset_id).not.toBe(t.id);
    expect(c.assets[0]!.r2_key.startsWith(`projects/${copy.id}/`)).toBe(true);
    expect(validateContent(c).ok).toBe(true);
  });
});
