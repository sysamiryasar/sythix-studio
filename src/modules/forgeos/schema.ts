import { z } from "zod";
import { ATTRIBUTES, EFFECTS, ENCHANTMENTS, MATERIALS, PARTICLES, RARITIES, SOUNDS } from "./catalog";

export const identifierSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9_]+$/, "Identifiers use lowercase letters, numbers and underscores.");

export const namespaceSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[a-z0-9_]+$/, "Namespaces use lowercase letters, numbers and underscores.")
  .refine((n) => n !== "minecraft", "The minecraft namespace is reserved.");

const attributeIds = ATTRIBUTES.map((a) => a.id) as [string, ...string[]];
const enchantmentIds = ENCHANTMENTS.map((e) => e.id) as [string, ...string[]];
const materialIds = MATERIALS.map((m) => m.id) as [string, ...string[]];

const textLine = z.object({ text: z.string().max(120), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), italic: z.boolean().optional() });

export const recipeSchema = z.object({
  /** 3 rows of 3 chars; space = empty. */
  pattern: z.array(z.string().max(3)).min(1).max(3),
  /** key char -> vanilla item id (without namespace) */
  key: z.record(z.string().length(1), z.string().regex(/^[a-z0-9_]+$/)),
});

export const itemDataSchema = z.object({
  lore: z.array(textLine).max(8).default([]),
  nameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  glint: z.boolean().default(false),
  unbreakable: z.boolean().default(false),
  durability: z.number().int().min(1).max(100_000).optional(),
  attributes: z
    .array(
      z.object({
        attribute: z.enum(attributeIds),
        /** Tooltip value for attack stats; raw modifier amount otherwise. */
        value: z.number().finite(),
        slot: z.enum(["mainhand", "offhand", "head", "chest", "legs", "feet", "armor", "any"]),
        operation: z.enum(["add_value", "add_multiplied_base", "add_multiplied_total"]).default("add_value"),
      }),
    )
    .max(12)
    .default([]),
  enchantments: z.array(z.object({ id: z.enum(enchantmentIds), level: z.number().int().min(1).max(255) })).max(16).default([]),
  /** Effects applied when consumed (consumables only; vanilla-supported). */
  consumeEffects: z
    .array(z.object({ effect: z.enum(EFFECTS), amplifier: z.number().int().min(0).max(9), durationTicks: z.number().int().min(1).max(72_000) }))
    .max(6)
    .default([]),
  food: z.object({ nutrition: z.number().int().min(0).max(20), saturation: z.number().min(0).max(20), canAlwaysEat: z.boolean() }).optional(),
  /** Runtime-only: abilities bound to this item (require SythiX Runtime). */
  abilityIds: z.array(identifierSchema).max(4).default([]),
  /** Runtime-only: effects applied to the target on hit. */
  onHitEffects: z
    .array(z.object({ effect: z.enum(EFFECTS), amplifier: z.number().int().min(0).max(9), durationTicks: z.number().int().min(1).max(1200), chance: z.number().min(0).max(1) }))
    .max(4)
    .default([]),
  recipe: recipeSchema.optional(),
  modelAssetId: z.string().max(64).optional(),
});

export type ItemData = z.infer<typeof itemDataSchema>;

export const itemInput = z.object({
  identifier: identifierSchema,
  name: z.string().trim().min(1).max(64),
  baseMaterial: z.enum(materialIds),
  rarity: z.enum(RARITIES),
  textureAssetId: z.string().max(64).nullable().optional(),
  data: itemDataSchema,
});
export type ItemInput = z.infer<typeof itemInput>;

// Abilities ------------------------------------------------------------------

export const TRIGGERS = ["right_click", "sneak_right_click", "left_click", "on_hit", "on_damaged", "on_kill"] as const;

const particle = z.enum(PARTICLES).optional();
const sound = z.enum(SOUNDS).optional();

export const ABILITY_TEMPLATES = {
  dash: z.object({ distance: z.number().min(1).max(20), horizontalOnly: z.boolean().default(true), particle, sound }),
  shockwave: z.object({ radius: z.number().min(1).max(12), damage: z.number().min(0).max(40), knockback: z.number().min(0).max(5), particle, sound }),
  projectile: z.object({ projectile: z.enum(["arrow", "snowball", "small_fireball", "wind_charge"]), speed: z.number().min(0.5).max(5), damage: z.number().min(0).max(40), particle, sound }),
  teleport: z.object({ range: z.number().min(1).max(64), requireLineOfSight: z.boolean().default(true), particle, sound }),
  shield: z.object({ absorptionHearts: z.number().int().min(1).max(20), durationTicks: z.number().int().min(20).max(1200), sound }),
  area_damage: z.object({ radius: z.number().min(1).max(10), damagePerTick: z.number().min(0.5).max(10), durationTicks: z.number().int().min(20).max(400), intervalTicks: z.number().int().min(5).max(100), particle }),
  healing: z.object({ hearts: z.number().min(0.5).max(20), radius: z.number().min(0).max(10), particle, sound }),
  temporary_buff: z.object({ effect: z.enum(EFFECTS), amplifier: z.number().int().min(0).max(4), durationTicks: z.number().int().min(20).max(6000), sound }),
  lightning: z.object({ range: z.number().min(1).max(48), visualOnly: z.boolean().default(false), damage: z.number().min(0).max(20), sound }),
  summon: z.object({ entity: z.enum(["wolf", "iron_golem", "allay", "vex", "bee"]), count: z.number().int().min(1).max(5), durationTicks: z.number().int().min(100).max(6000), particle }),
} as const;

export type AbilityTemplate = keyof typeof ABILITY_TEMPLATES;
export const ABILITY_TEMPLATE_IDS = Object.keys(ABILITY_TEMPLATES) as AbilityTemplate[];

export const abilityInput = z.object({
  identifier: identifierSchema,
  name: z.string().trim().min(1).max(64),
  template: z.enum(ABILITY_TEMPLATE_IDS as [AbilityTemplate, ...AbilityTemplate[]]),
  trigger: z.enum(TRIGGERS),
  cooldownTicks: z.number().int().min(0).max(72_000),
  permission: z
    .string()
    .regex(/^[a-z0-9_.-]+$/, "Permission nodes use lowercase letters, numbers, dots, dashes and underscores.")
    .max(80)
    .nullable()
    .optional(),
  params: z.record(z.string(), z.unknown()),
});
export type AbilityInput = z.infer<typeof abilityInput>;

/** Validates params against the chosen template's schema; returns normalised params. */
export function parseAbilityParams(template: AbilityTemplate, params: unknown) {
  return ABILITY_TEMPLATES[template].parse(params);
}

// Equipment sets -------------------------------------------------------------

export const SET_CONDITIONS = ["health_below", "sneaking", "in_water", "time_of_day", "cooldown_ready", "full_set_equipped"] as const;

export const setConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("health_below"), percent: z.number().min(1).max(99) }),
  z.object({ type: z.literal("sneaking") }),
  z.object({ type: z.literal("in_water") }),
  z.object({ type: z.literal("time_of_day"), value: z.enum(["day", "night"]) }),
  z.object({ type: z.literal("cooldown_ready"), abilityId: identifierSchema }),
  z.object({ type: z.literal("full_set_equipped") }),
]);

export const setBonusSchema = z.object({
  piecesRequired: z.number().int().min(1).max(4),
  effects: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("potion"), effect: z.enum(EFFECTS), amplifier: z.number().int().min(0).max(4) }),
        z.object({ type: z.literal("attribute"), attribute: z.enum(attributeIds), amount: z.number().finite() }),
        z.object({ type: z.literal("ability"), abilityId: identifierSchema }),
      ]),
    )
    .min(1)
    .max(6),
  conditions: z.array(setConditionSchema).max(4).default([]),
});

export const equipmentSetInput = z.object({
  identifier: identifierSchema,
  name: z.string().trim().min(1).max(64),
  data: z.object({ pieces: z.array(identifierSchema).min(2).max(4), bonuses: z.array(setBonusSchema).min(1).max(4) }),
});
export type EquipmentSetInput = z.infer<typeof equipmentSetInput>;

export const projectInput = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).default(""),
  namespace: namespaceSchema.optional(),
  targetVersion: z.string().max(16),
  folder: z
    .string()
    .trim()
    .max(80)
    .regex(/^[^\\<>:"|?*]*$/, "Folder names cannot contain special path characters.")
    .default(""),
  visibility: z.enum(["private", "public"]).default("private"),
});
