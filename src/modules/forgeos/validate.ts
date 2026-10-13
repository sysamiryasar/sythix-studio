import { ABILITY_TEMPLATES, type AbilityTemplate } from "./schema";
import { ATTRIBUTES, ENCHANTMENTS, getMaterial } from "./catalog";
import { getTarget } from "./versions";
import type { ProjectContent } from "./content";
import { parseModelJson } from "./models";

export type ExportFormat = "datapack" | "resourcepack" | "bundle";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  entity: string;
  field?: string;
  message: string;
  /** Formats this issue blocks (errors) or applies to. Empty = all. */
  formats?: ExportFormat[];
}

export interface ValidationReport {
  target: string;
  ok: boolean;
  issues: ValidationIssue[];
  /** What each output actually implements for this project. */
  support: {
    datapack: string[];
    resourcepack: string[];
    runtimeOnly: string[];
  };
}

const RUNTIME_NOTE = "Requires the SythiX Runtime server plugin, which is planned and not yet available. Included in the bundle's sythix-runtime.json only.";

export function blocks(report: ValidationReport, format: ExportFormat): ValidationIssue[] {
  return report.issues.filter((i) => i.severity === "error" && (!i.formats || i.formats.length === 0 || i.formats.includes(format) || format === "bundle"));
}

export function validateContent(c: ProjectContent): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue["severity"], entity: string, message: string, extra: Partial<ValidationIssue> = {}) => issues.push({ severity, entity, message, ...extra });
  const target = getTarget(c.project.target_version);
  const support = { datapack: [] as string[], resourcepack: [] as string[], runtimeOnly: [] as string[] };

  if (!target) {
    add("error", "project", `Target version ${c.project.target_version} is not supported by the exporters.`, { field: "target_version" });
    return { target: c.project.target_version, ok: false, issues, support };
  }
  if (c.items.length === 0) add("warning", "project", "The project has no items yet; exports will contain only metadata.");

  const assetsById = new Map(c.assets.map((a) => [a.id, a]));
  const textureNames = new Set(c.assets.filter((a) => a.kind === "texture").map((a) => a.name));
  const abilityIds = new Set(c.abilities.map((a) => a.identifier));
  const itemsById = new Map(c.items.map((i) => [i.identifier, i]));

  for (const item of c.items) {
    const e = `item:${item.identifier}`;
    const mat = getMaterial(item.base_material);
    if (!mat) {
      add("error", e, `Unknown base material "${item.base_material}".`, { field: "base_material" });
      continue;
    }
    const d = item.data;
    const vanillaFeatures: string[] = ["name", "rarity"];

    for (const a of d.attributes) {
      const def = ATTRIBUTES.find((x) => x.id === a.attribute)!;
      if (!def.kinds.includes(mat.kind)) add("warning", e, `${def.label} is unusual on a ${mat.kind}; it will still apply in the "${a.slot}" slot.`, { field: "attributes" });
      if (a.value < def.min || a.value > def.max) add("error", e, `${def.label} must be between ${def.min} and ${def.max}.`, { field: "attributes", formats: ["datapack"] });
      if (mat.armorSlot && a.slot !== mat.armorSlot && a.slot !== "armor" && a.slot !== "any") {
        add("warning", e, `Armor attributes in the "${a.slot}" slot won't apply while this ${mat.armorSlot} piece is worn.`, { field: "attributes" });
      }
    }
    if (d.attributes.length) {
      vanillaFeatures.push("attribute modifiers");
      if ((mat.kind === "weapon" || mat.kind === "tool") && !d.attributes.some((a) => a.attribute === "attack_damage")) {
        add("info", e, "Custom attribute modifiers replace the base item's defaults; add Attack damage to keep a melee value.", { field: "attributes" });
      }
    }
    for (const en of d.enchantments) {
      const def = ENCHANTMENTS.find((x) => x.id === en.id)!;
      if (!def.kinds.includes(mat.kind)) add("warning", e, `${def.label} has no effect on a ${mat.kind} in vanilla.`, { field: "enchantments" });
      if (en.level > def.maxLevel) add("warning", e, `${def.label} ${en.level} exceeds the vanilla maximum (${def.maxLevel}); it works but shows as a raw number.`, { field: "enchantments" });
    }
    if (d.enchantments.length) vanillaFeatures.push("enchantments");
    if (d.durability) {
      vanillaFeatures.push("durability");
      if (mat.stackable) add("info", e, "Durability requires a stack size of 1; max_stack_size: 1 is added automatically.", { field: "durability" });
      if (d.unbreakable) add("warning", e, "Unbreakable items ignore durability.", { field: "durability" });
    }
    if (d.unbreakable) vanillaFeatures.push("unbreakable");
    if (d.glint) vanillaFeatures.push("enchantment glint");
    if (d.lore.length) vanillaFeatures.push("lore");
    if (d.consumeEffects.length || d.food) {
      if (mat.kind !== "consumable") add("error", e, "Food and consume effects can only be set on consumable base items.", { field: "consumeEffects", formats: ["datapack"] });
      else vanillaFeatures.push("food/consume effects");
    }
    for (const id of d.abilityIds) {
      if (!abilityIds.has(id)) add("error", e, `Ability "${id}" does not exist in this project.`, { field: "abilityIds" });
    }
    if (d.abilityIds.length || d.onHitEffects.length) {
      add("info", e, `Abilities and on-hit effects: ${RUNTIME_NOTE}`, { field: "abilityIds" });
      support.runtimeOnly.push(`${item.identifier}: ${[d.abilityIds.length && "abilities", d.onHitEffects.length && "on-hit effects"].filter(Boolean).join(", ")}`);
    }

    // Recipe
    if (d.recipe) {
      const widths = new Set(d.recipe.pattern.map((r) => r.length));
      if (widths.size !== 1) add("error", e, "All recipe rows must have the same width.", { field: "recipe", formats: ["datapack"] });
      const used = new Set(d.recipe.pattern.join("").replace(/ /g, ""));
      if (used.size === 0) add("error", e, "The recipe has no ingredients.", { field: "recipe", formats: ["datapack"] });
      for (const ch of used) if (!d.recipe.key[ch]) add("error", e, `Recipe symbol "${ch}" has no ingredient.`, { field: "recipe", formats: ["datapack"] });
      for (const ch of Object.keys(d.recipe.key)) if (!used.has(ch)) add("warning", e, `Recipe key "${ch}" is defined but unused.`, { field: "recipe" });
      if (d.recipe.key[" "]) add("error", e, "Space is reserved for empty recipe slots.", { field: "recipe", formats: ["datapack"] });
      vanillaFeatures.push("crafting recipe");
    }

    // Visuals
    if (item.texture_asset_id) {
      const tex = assetsById.get(item.texture_asset_id);
      if (!tex || tex.kind !== "texture") add("error", e, "The selected texture no longer exists.", { field: "texture", formats: ["resourcepack"] });
      else if (!target.itemModelComponent && !mat.simpleModel) {
        add("error", e, `Custom textures on ${mat.label} need target 1.21.4+; older versions use a special built-in model that overrides cannot replace safely.`, {
          field: "texture",
          formats: ["resourcepack"],
        });
      } else support.resourcepack.push(`${item.identifier}: texture + item model`);
    } else if (!d.modelAssetId) {
      add("info", e, "No custom texture: the item uses the vanilla texture of its base material.", { field: "texture" });
    }
    if (d.modelAssetId) {
      const model = assetsById.get(d.modelAssetId);
      if (!model || model.kind !== "model") add("error", e, "The selected model no longer exists.", { field: "model", formats: ["resourcepack"] });
      else {
        const refs = (model.metadata.textureRefs as string[] | undefined) ?? [];
        for (const r of refs) if (!textureNames.has(r)) add("error", e, `Model references texture "${r}", which is not in this project.`, { field: "model", formats: ["resourcepack"] });
        support.resourcepack.push(`${item.identifier}: custom 3D model`);
      }
    }
    support.datapack.push(`${item.identifier}: ${vanillaFeatures.join(", ")}`);
  }

  for (const ab of c.abilities) {
    const e = `ability:${ab.identifier}`;
    const schema = ABILITY_TEMPLATES[ab.template as AbilityTemplate];
    if (!schema) add("error", e, `Unknown ability template "${ab.template}".`);
    else {
      const r = schema.safeParse(ab.params);
      if (!r.success) for (const iss of r.error.issues) add("error", e, `${iss.path.join(".") || "params"}: ${iss.message}`, { field: "params", formats: ["bundle"] });
    }
    if (ab.cooldown_ticks === 0 && ["shockwave", "area_damage", "lightning", "summon", "projectile"].includes(ab.template)) {
      add("warning", e, "Damaging abilities without a cooldown can be spammed.", { field: "cooldown_ticks" });
    }
    if (!c.items.some((i) => i.data.abilityIds.includes(ab.identifier)) && !c.sets.some((s) => JSON.stringify(s.data).includes(`"${ab.identifier}"`))) {
      add("warning", e, "This ability isn't bound to any item or set bonus.");
    }
    support.runtimeOnly.push(`ability ${ab.identifier} (${ab.template})`);
  }

  for (const set of c.sets) {
    const e = `set:${set.identifier}`;
    const slots = new Set<string>();
    for (const p of set.data.pieces) {
      const it = itemsById.get(p);
      if (!it) add("error", e, `Set piece "${p}" is not an item in this project.`, { field: "pieces", formats: ["bundle"] });
      else {
        const slot = getMaterial(it.base_material)?.armorSlot;
        if (!slot) add("error", e, `Set piece "${p}" is not an armor item.`, { field: "pieces", formats: ["bundle"] });
        else if (slots.has(slot)) add("error", e, `Two set pieces use the ${slot} slot.`, { field: "pieces", formats: ["bundle"] });
        else slots.add(slot);
      }
    }
    for (const [i, b] of set.data.bonuses.entries()) {
      if (b.piecesRequired > set.data.pieces.length) add("error", e, `Bonus ${i + 1} requires more pieces than the set has.`, { field: "bonuses", formats: ["bundle"] });
      for (const eff of b.effects) if (eff.type === "ability" && !abilityIds.has(eff.abilityId as string)) add("error", e, `Bonus ${i + 1} references unknown ability "${String(eff.abilityId)}".`, { formats: ["bundle"] });
      for (const cond of b.conditions) if (cond.type === "cooldown_ready" && !abilityIds.has(cond.abilityId as string)) add("error", e, `Bonus ${i + 1} condition references unknown ability.`, { formats: ["bundle"] });
    }
    add("info", e, `Set bonuses and conditions: ${RUNTIME_NOTE}`);
    support.runtimeOnly.push(`set ${set.identifier}`);
  }

  for (const asset of c.assets.filter((a) => a.kind === "model")) {
    const parsed = parseModelJson(JSON.stringify(asset.metadata.model ?? {}));
    if (!parsed.ok) add("error", `asset:${asset.name}`, `Model is invalid: ${parsed.error}`, { formats: ["resourcepack"] });
  }

  return { target: target.id, ok: !issues.some((i) => i.severity === "error"), issues, support };
}
