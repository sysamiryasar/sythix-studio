// Vanilla content ForgeOS can reference. Kept deliberately small and accurate.

export type ItemKind = "weapon" | "tool" | "armor" | "consumable" | "misc";
export type ArmorSlot = "head" | "chest" | "legs" | "feet";

export interface Material {
  id: string;
  label: string;
  kind: ItemKind;
  /** Vanilla item model parent; used for the generated custom model. */
  parent: "item/handheld" | "item/generated";
  /** Has a plain single-layer vanilla model, so pre-1.21.4 overrides are safe. */
  simpleModel: boolean;
  stackable: boolean;
  armorSlot?: ArmorSlot;
}

const m = (id: string, label: string, kind: ItemKind, parent: Material["parent"], extra: Partial<Material> = {}): Material => ({
  id, label, kind, parent, simpleModel: true, stackable: kind === "misc" || kind === "consumable", ...extra,
});

export const MATERIALS: readonly Material[] = [
  m("wooden_sword", "Wooden Sword", "weapon", "item/handheld"),
  m("stone_sword", "Stone Sword", "weapon", "item/handheld"),
  m("iron_sword", "Iron Sword", "weapon", "item/handheld"),
  m("golden_sword", "Golden Sword", "weapon", "item/handheld"),
  m("diamond_sword", "Diamond Sword", "weapon", "item/handheld"),
  m("netherite_sword", "Netherite Sword", "weapon", "item/handheld"),
  m("iron_axe", "Iron Axe", "weapon", "item/handheld"),
  m("diamond_axe", "Diamond Axe", "weapon", "item/handheld"),
  m("netherite_axe", "Netherite Axe", "weapon", "item/handheld"),
  m("trident", "Trident", "weapon", "item/handheld", { simpleModel: false }),
  m("bow", "Bow", "weapon", "item/generated", { simpleModel: false }),
  m("crossbow", "Crossbow", "weapon", "item/generated", { simpleModel: false }),
  m("mace", "Mace", "weapon", "item/handheld"),
  m("iron_pickaxe", "Iron Pickaxe", "tool", "item/handheld"),
  m("diamond_pickaxe", "Diamond Pickaxe", "tool", "item/handheld"),
  m("netherite_pickaxe", "Netherite Pickaxe", "tool", "item/handheld"),
  m("iron_shovel", "Iron Shovel", "tool", "item/handheld"),
  m("diamond_shovel", "Diamond Shovel", "tool", "item/handheld"),
  m("diamond_hoe", "Diamond Hoe", "tool", "item/handheld"),
  m("stick", "Stick", "misc", "item/handheld"),
  m("blaze_rod", "Blaze Rod", "misc", "item/handheld"),
  m("iron_helmet", "Iron Helmet", "armor", "item/generated", { armorSlot: "head" }),
  m("iron_chestplate", "Iron Chestplate", "armor", "item/generated", { armorSlot: "chest" }),
  m("iron_leggings", "Iron Leggings", "armor", "item/generated", { armorSlot: "legs" }),
  m("iron_boots", "Iron Boots", "armor", "item/generated", { armorSlot: "feet" }),
  m("diamond_helmet", "Diamond Helmet", "armor", "item/generated", { armorSlot: "head" }),
  m("diamond_chestplate", "Diamond Chestplate", "armor", "item/generated", { armorSlot: "chest" }),
  m("diamond_leggings", "Diamond Leggings", "armor", "item/generated", { armorSlot: "legs" }),
  m("diamond_boots", "Diamond Boots", "armor", "item/generated", { armorSlot: "feet" }),
  m("netherite_helmet", "Netherite Helmet", "armor", "item/generated", { armorSlot: "head" }),
  m("netherite_chestplate", "Netherite Chestplate", "armor", "item/generated", { armorSlot: "chest" }),
  m("netherite_leggings", "Netherite Leggings", "armor", "item/generated", { armorSlot: "legs" }),
  m("netherite_boots", "Netherite Boots", "armor", "item/generated", { armorSlot: "feet" }),
  m("apple", "Apple", "consumable", "item/generated"),
  m("golden_apple", "Golden Apple", "consumable", "item/generated"),
  m("cookie", "Cookie", "consumable", "item/generated"),
  m("paper", "Paper", "misc", "item/generated"),
  m("amethyst_shard", "Amethyst Shard", "misc", "item/generated"),
  m("nether_star", "Nether Star", "misc", "item/generated"),
  m("echo_shard", "Echo Shard", "misc", "item/generated"),
];

export function getMaterial(id: string): Material | undefined {
  return MATERIALS.find((x) => x.id === id);
}

/** Attributes: id without the "generic." prefix; displayBase is the player base value shown in tooltips. */
export interface AttributeDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** For weapon stats the editor works in tooltip values; the modifier amount is value - displayBase. */
  displayBase?: number;
  kinds: ItemKind[];
}

export const ATTRIBUTES: readonly AttributeDef[] = [
  { id: "attack_damage", label: "Attack damage", min: 0, max: 2048, step: 0.5, displayBase: 1, kinds: ["weapon", "tool"] },
  { id: "attack_speed", label: "Attack speed", min: 0, max: 1024, step: 0.1, displayBase: 4, kinds: ["weapon", "tool"] },
  { id: "armor", label: "Armor", min: 0, max: 30, step: 1, kinds: ["armor"] },
  { id: "armor_toughness", label: "Armor toughness", min: 0, max: 20, step: 0.5, kinds: ["armor"] },
  { id: "knockback_resistance", label: "Knockback resistance", min: 0, max: 1, step: 0.05, kinds: ["armor"] },
  { id: "max_health", label: "Max health", min: -20, max: 40, step: 1, kinds: ["weapon", "tool", "armor", "misc"] },
  { id: "movement_speed", label: "Movement speed", min: -0.1, max: 0.1, step: 0.005, kinds: ["weapon", "tool", "armor", "misc"] },
  { id: "luck", label: "Luck", min: -1024, max: 1024, step: 1, kinds: ["weapon", "tool", "armor", "misc"] },
];

export interface EnchantmentDef {
  id: string;
  label: string;
  maxLevel: number;
  kinds: ItemKind[];
}

export const ENCHANTMENTS: readonly EnchantmentDef[] = [
  { id: "sharpness", label: "Sharpness", maxLevel: 5, kinds: ["weapon"] },
  { id: "smite", label: "Smite", maxLevel: 5, kinds: ["weapon"] },
  { id: "bane_of_arthropods", label: "Bane of Arthropods", maxLevel: 5, kinds: ["weapon"] },
  { id: "knockback", label: "Knockback", maxLevel: 2, kinds: ["weapon"] },
  { id: "fire_aspect", label: "Fire Aspect", maxLevel: 2, kinds: ["weapon"] },
  { id: "looting", label: "Looting", maxLevel: 3, kinds: ["weapon"] },
  { id: "sweeping_edge", label: "Sweeping Edge", maxLevel: 3, kinds: ["weapon"] },
  { id: "efficiency", label: "Efficiency", maxLevel: 5, kinds: ["tool"] },
  { id: "fortune", label: "Fortune", maxLevel: 3, kinds: ["tool"] },
  { id: "silk_touch", label: "Silk Touch", maxLevel: 1, kinds: ["tool"] },
  { id: "protection", label: "Protection", maxLevel: 4, kinds: ["armor"] },
  { id: "fire_protection", label: "Fire Protection", maxLevel: 4, kinds: ["armor"] },
  { id: "blast_protection", label: "Blast Protection", maxLevel: 4, kinds: ["armor"] },
  { id: "projectile_protection", label: "Projectile Protection", maxLevel: 4, kinds: ["armor"] },
  { id: "thorns", label: "Thorns", maxLevel: 3, kinds: ["armor"] },
  { id: "feather_falling", label: "Feather Falling", maxLevel: 4, kinds: ["armor"] },
  { id: "unbreaking", label: "Unbreaking", maxLevel: 3, kinds: ["weapon", "tool", "armor"] },
  { id: "mending", label: "Mending", maxLevel: 1, kinds: ["weapon", "tool", "armor"] },
];

export const EFFECTS = [
  "speed", "slowness", "haste", "strength", "instant_health", "jump_boost", "regeneration", "resistance", "fire_resistance",
  "water_breathing", "invisibility", "night_vision", "absorption", "saturation", "glowing", "luck", "slow_falling", "weakness", "poison",
] as const;

export const PARTICLES = ["flame", "soul_fire_flame", "end_rod", "crit", "enchant", "portal", "cloud", "smoke", "electric_spark", "heart", "witch", "dragon_breath"] as const;

export const SOUNDS = [
  "entity.player.attack.sweep", "entity.ender_dragon.flap", "entity.lightning_bolt.thunder", "entity.enderman.teleport",
  "item.trident.riptide_1", "block.beacon.activate", "entity.generic.explode", "item.totem.use", "block.amethyst_block.chime",
] as const;

export const RARITIES = ["common", "uncommon", "rare", "epic"] as const;
