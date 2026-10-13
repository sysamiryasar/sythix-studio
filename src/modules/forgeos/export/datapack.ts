import type { ProjectContent, ItemRecord } from "../content";
import type { TargetVersion } from "../versions";
import { attributeId, customModelDataFor, hasVisual, isStackable, modifierAmount, putJson, putText, textComponent, uuidIntArray, type FileMap } from "./common";

function folders(t: TargetVersion) {
  return t.pluralDataFolders ? { fn: "functions", recipe: "recipes", loot: "loot_tables" } : { fn: "function", recipe: "recipe", loot: "loot_table" };
}

/** Data components shared by the loot table (set_components) and recipe results. */
function visualAndBehaviourComponents(c: ProjectContent, t: TargetVersion, item: ItemRecord, cmd: Map<string, number>): Record<string, unknown> {
  const d = item.data;
  const comps: Record<string, unknown> = { "minecraft:rarity": item.rarity };
  if (d.glint) comps["minecraft:enchantment_glint_override"] = true;
  if (d.unbreakable) comps["minecraft:unbreakable"] = {};
  if (d.durability && !d.unbreakable) {
    comps["minecraft:max_damage"] = d.durability;
    if (isStackable(item)) comps["minecraft:max_stack_size"] = 1;
  }
  if (hasVisual(item)) {
    if (t.itemModelComponent) comps["minecraft:item_model"] = `${c.project.namespace}:${item.identifier}`;
    else comps["minecraft:custom_model_data"] = cmd.get(item.identifier);
  }
  if (d.food) {
    comps["minecraft:food"] = t.consumableComponent
      ? { nutrition: d.food.nutrition, saturation: d.food.saturation, can_always_eat: d.food.canAlwaysEat }
      : {
          nutrition: d.food.nutrition,
          saturation: d.food.saturation,
          can_always_eat: d.food.canAlwaysEat,
          effects: d.consumeEffects.map((e) => ({ effect: { id: `minecraft:${e.effect}`, duration: e.durationTicks, amplifier: e.amplifier }, probability: 1 })),
        };
  }
  if (t.consumableComponent && d.consumeEffects.length) {
    comps["minecraft:consumable"] = {
      on_consume_effects: [
        { type: "minecraft:apply_effects", effects: d.consumeEffects.map((e) => ({ id: `minecraft:${e.effect}`, duration: e.durationTicks, amplifier: e.amplifier })), probability: 1 },
      ],
    };
  }
  return comps;
}

function encodeText(t: TargetVersion, component: Record<string, unknown>): unknown {
  // Before 1.21.5, text inside item components is serialised as a JSON string.
  return t.inlineTextComponents ? component : JSON.stringify(component);
}

/** Full component set used for recipe results (where loot functions are unavailable). */
function recipeResultComponents(c: ProjectContent, t: TargetVersion, item: ItemRecord, cmd: Map<string, number>): Record<string, unknown> {
  const d = item.data;
  const comps = visualAndBehaviourComponents(c, t, item, cmd);
  comps["minecraft:item_name"] = encodeText(t, textComponent(item.name, d.nameColor));
  if (d.lore.length) comps["minecraft:lore"] = d.lore.map((l) => encodeText(t, textComponent(l.text, l.color, l.italic ?? false)));
  if (d.enchantments.length) {
    const levels = Object.fromEntries(d.enchantments.map((e) => [`minecraft:${e.id}`, e.level]));
    comps["minecraft:enchantments"] = t.flatEnchantments ? levels : { levels };
  }
  if (d.attributes.length) {
    const modifiers = d.attributes.map((a) => {
      const base = { type: attributeId(t, a.attribute), amount: modifierAmount(a.attribute, a.value, a.operation), operation: a.operation, slot: a.slot };
      return t.modifierIds
        ? { ...base, id: `${c.project.namespace}:${item.identifier}_${a.attribute}_${a.slot}` }
        : { ...base, uuid: uuidIntArray(`${c.project.namespace}:${item.identifier}:${a.attribute}:${a.slot}`), name: `${c.project.namespace}.${item.identifier}.${a.attribute}` };
    });
    comps["minecraft:attribute_modifiers"] = t.listAttributeModifiers ? modifiers : { modifiers };
  }
  return comps;
}

function lootTable(c: ProjectContent, t: TargetVersion, item: ItemRecord, cmd: Map<string, number>) {
  const d = item.data;
  const functions: Record<string, unknown>[] = [{ function: "minecraft:set_name", target: "item_name", name: textComponent(item.name, d.nameColor) }];
  if (d.lore.length) functions.push({ function: "minecraft:set_lore", mode: "replace_all", lore: d.lore.map((l) => textComponent(l.text, l.color, l.italic ?? false)) });
  if (d.enchantments.length) {
    functions.push({ function: "minecraft:set_enchantments", add: false, enchantments: Object.fromEntries(d.enchantments.map((e) => [`minecraft:${e.id}`, e.level])) });
  }
  if (d.attributes.length) {
    functions.push({
      function: "minecraft:set_attributes",
      replace: true,
      modifiers: d.attributes.map((a) => {
        const base = { attribute: attributeId(t, a.attribute), operation: a.operation, amount: modifierAmount(a.attribute, a.value, a.operation), slot: a.slot };
        return t.modifierIds ? { ...base, id: `${c.project.namespace}:${item.identifier}_${a.attribute}_${a.slot}` } : { ...base, name: `${c.project.namespace}.${item.identifier}.${a.attribute}` };
      }),
    });
  }
  functions.push({ function: "minecraft:set_components", components: visualAndBehaviourComponents(c, t, item, cmd) });
  return { type: "minecraft:generic", pools: [{ rolls: 1, entries: [{ type: "minecraft:item", name: `minecraft:${item.base_material}`, functions }] }] };
}

function recipe(c: ProjectContent, t: TargetVersion, item: ItemRecord, cmd: Map<string, number>) {
  const r = item.data.recipe!;
  const key = Object.fromEntries(
    Object.entries(r.key)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, t.stringIngredients ? `minecraft:${v}` : { item: `minecraft:${v}` }]),
  );
  return {
    type: "minecraft:crafting_shaped",
    category: item.kind === "armor" || item.kind === "weapon" || item.kind === "tool" ? "equipment" : "misc",
    pattern: r.pattern,
    key,
    result: { id: `minecraft:${item.base_material}`, count: 1, components: recipeResultComponents(c, t, item, cmd) },
  };
}

/** Generates a vanilla datapack: loot tables, give functions and shaped recipes. */
export function generateDatapack(c: ProjectContent, t: TargetVersion): FileMap {
  const files: FileMap = new Map();
  const ns = c.project.namespace;
  const f = folders(t);
  const cmd = customModelDataFor(c);
  putJson(files, "pack.mcmeta", { pack: { pack_format: t.datapackFormat, description: `${c.project.name} — generated by SythiX ForgeOS` } });

  const giveAll: string[] = [];
  for (const item of c.items) {
    putJson(files, `data/${ns}/${f.loot}/items/${item.identifier}.json`, lootTable(c, t, item, cmd));
    putText(files, `data/${ns}/${f.fn}/give/${item.identifier}.mcfunction`, `# Gives ${item.name} to the executing player.\nloot give @s loot ${ns}:items/${item.identifier}\n`);
    giveAll.push(`loot give @s loot ${ns}:items/${item.identifier}`);
    if (item.data.recipe) putJson(files, `data/${ns}/${f.recipe}/${item.identifier}.json`, recipe(c, t, item, cmd));
  }
  putText(files, `data/${ns}/${f.fn}/give_all.mcfunction`, `# Gives every ${c.project.name} item.\n${giveAll.join("\n")}${giveAll.length ? "\n" : ""}`);
  return files;
}
