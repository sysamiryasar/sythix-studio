import { EFFECTS, PARTICLES, SOUNDS } from "@/modules/forgeos/catalog";
import type { AbilityTemplate } from "@/modules/forgeos/schema";

// UI metadata for each ability template. Validation is always done by the
// zod schemas in modules/forgeos/schema.ts on the server; this only drives inputs.
export type FieldDef =
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number; default: number }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | { key: string; label: string; type: "select"; options: readonly string[]; default?: string; optional?: boolean };

const particle: FieldDef = { key: "particle", label: "Particle", type: "select", options: PARTICLES, optional: true };
const sound: FieldDef = { key: "sound", label: "Sound", type: "select", options: SOUNDS, optional: true };

export const TEMPLATE_INFO: Record<AbilityTemplate, { label: string; description: string; fields: FieldDef[] }> = {
  dash: { label: "Dash", description: "Launch the player forward.", fields: [{ key: "distance", label: "Distance (blocks)", type: "number", min: 1, max: 20, default: 6 }, { key: "horizontalOnly", label: "Horizontal only", type: "boolean", default: true }, particle, sound] },
  shockwave: { label: "Shockwave", description: "Damage and knock back nearby entities.", fields: [{ key: "radius", label: "Radius", type: "number", min: 1, max: 12, default: 4 }, { key: "damage", label: "Damage", type: "number", min: 0, max: 40, default: 6 }, { key: "knockback", label: "Knockback", type: "number", min: 0, max: 5, step: 0.1, default: 1.5 }, particle, sound] },
  projectile: { label: "Projectile", description: "Fire a projectile where the player looks.", fields: [{ key: "projectile", label: "Projectile", type: "select", options: ["arrow", "snowball", "small_fireball", "wind_charge"], default: "small_fireball" }, { key: "speed", label: "Speed", type: "number", min: 0.5, max: 5, step: 0.1, default: 1.5 }, { key: "damage", label: "Damage", type: "number", min: 0, max: 40, default: 5 }, particle, sound] },
  teleport: { label: "Teleport", description: "Blink to the targeted block.", fields: [{ key: "range", label: "Range", type: "number", min: 1, max: 64, default: 16 }, { key: "requireLineOfSight", label: "Require line of sight", type: "boolean", default: true }, particle, sound] },
  shield: { label: "Shield", description: "Grant temporary absorption hearts.", fields: [{ key: "absorptionHearts", label: "Absorption hearts", type: "number", min: 1, max: 20, default: 4 }, { key: "durationTicks", label: "Duration (ticks)", type: "number", min: 20, max: 1200, default: 200 }, sound] },
  area_damage: { label: "Area damage", description: "Damage over time in a radius.", fields: [{ key: "radius", label: "Radius", type: "number", min: 1, max: 10, default: 3 }, { key: "damagePerTick", label: "Damage per pulse", type: "number", min: 0.5, max: 10, step: 0.5, default: 2 }, { key: "durationTicks", label: "Duration (ticks)", type: "number", min: 20, max: 400, default: 100 }, { key: "intervalTicks", label: "Pulse interval (ticks)", type: "number", min: 5, max: 100, default: 20 }, particle] },
  healing: { label: "Healing", description: "Heal the user, or allies in a radius.", fields: [{ key: "hearts", label: "Hearts", type: "number", min: 0.5, max: 20, step: 0.5, default: 3 }, { key: "radius", label: "Radius (0 = self)", type: "number", min: 0, max: 10, default: 0 }, particle, sound] },
  temporary_buff: { label: "Temporary buff", description: "Apply a potion effect to the user.", fields: [{ key: "effect", label: "Effect", type: "select", options: EFFECTS, default: "strength" }, { key: "amplifier", label: "Amplifier", type: "number", min: 0, max: 4, default: 0 }, { key: "durationTicks", label: "Duration (ticks)", type: "number", min: 20, max: 6000, default: 200 }, sound] },
  lightning: { label: "Lightning strike", description: "Strike the targeted location.", fields: [{ key: "range", label: "Range", type: "number", min: 1, max: 48, default: 24 }, { key: "visualOnly", label: "Visual only", type: "boolean", default: false }, { key: "damage", label: "Damage", type: "number", min: 0, max: 20, default: 5 }, sound] },
  summon: { label: "Summon", description: "Summon temporary allies.", fields: [{ key: "entity", label: "Entity", type: "select", options: ["wolf", "iron_golem", "allay", "vex", "bee"], default: "wolf" }, { key: "count", label: "Count", type: "number", min: 1, max: 5, default: 2 }, { key: "durationTicks", label: "Duration (ticks)", type: "number", min: 100, max: 6000, default: 600 }, particle] },
};

export function defaultParams(t: AbilityTemplate): Record<string, unknown> {
  return Object.fromEntries(TEMPLATE_INFO[t].fields.filter((f) => !(f.type === "select" && f.optional)).map((f) => [f.key, f.default]));
}
