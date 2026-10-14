import type { ProjectContent } from "../content";

/**
 * Canonical configuration for abilities, on-hit effects and set bonuses.
 * These need server-side logic that vanilla Minecraft does not provide; the
 * file targets the planned SythiX Runtime plugin and is marked as such.
 */
export function generateRuntimeConfig(c: ProjectContent) {
  return {
    $schema: "sythix-runtime/1",
    status: "planned-runtime — no compatible plugin is available yet; this file is not executed by vanilla Minecraft",
    namespace: c.project.namespace,
    target: c.project.target_version,
    items: c.items
      .filter((i) => i.data.abilityIds.length || i.data.onHitEffects.length)
      .map((i) => ({ item: `${c.project.namespace}:${i.identifier}`, abilities: i.data.abilityIds, onHitEffects: i.data.onHitEffects })),
    abilities: c.abilities.map((a) => ({
      id: `${c.project.namespace}:${a.identifier}`,
      name: a.name,
      template: a.template,
      trigger: a.trigger_kind,
      cooldownTicks: a.cooldown_ticks,
      permission: a.permission,
      params: a.params,
    })),
    sets: c.sets.map((s) => ({
      id: `${c.project.namespace}:${s.identifier}`,
      name: s.name,
      pieces: s.data.pieces.map((p) => `${c.project.namespace}:${p}`),
      bonuses: s.data.bonuses,
    })),
  };
}
