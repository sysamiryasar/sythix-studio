// Minecraft: Java Edition targets supported by the ForgeOS exporters.
// Only versions whose data formats the generators implement exactly are listed;
// adding a version means adding its row here plus generator tests.

export interface TargetVersion {
  id: string;
  label: string;
  datapackFormat: number;
  resourcePackFormat: number;
  /** "functions"/"recipes"/"loot_tables" (<=1.20.6) vs singular folder names (1.21+). */
  pluralDataFolders: boolean;
  /** Attribute ids carry the "generic." prefix (<=1.21.1). */
  genericAttributePrefix: boolean;
  /** Attribute modifiers identified by namespaced id (1.21+) rather than name+UUID. */
  modifierIds: boolean;
  /** `item_model` component + assets/<ns>/items definitions (1.21.4+). Older targets use custom_model_data overrides. */
  itemModelComponent: boolean;
  /** custom_model_data is an object with `floats` (1.21.4+) instead of an int. */
  customModelDataObject: boolean;
  /** Recipe ingredients are plain strings (1.21.2+) instead of {"item": ...}. */
  stringIngredients: boolean;
  /** Enchantments component is a flat map (1.21.5+) instead of {levels: {...}}. */
  flatEnchantments: boolean;
  /** attribute_modifiers component is a plain list (1.21.5+) instead of {modifiers: [...]}. */
  listAttributeModifiers: boolean;
  /** Text components inside item components are objects (1.21.5+) instead of JSON strings. */
  inlineTextComponents: boolean;
  /** Consumable effects live in a separate `consumable` component (1.21.2+). */
  consumableComponent: boolean;
}

export const TARGET_VERSIONS: readonly TargetVersion[] = [
  {
    id: "1.20.6", label: "1.20.5 – 1.20.6", datapackFormat: 41, resourcePackFormat: 32,
    pluralDataFolders: true, genericAttributePrefix: true, modifierIds: false, itemModelComponent: false, customModelDataObject: false,
    stringIngredients: false, flatEnchantments: false, listAttributeModifiers: false, inlineTextComponents: false, consumableComponent: false,
  },
  {
    id: "1.21.1", label: "1.21 – 1.21.1", datapackFormat: 48, resourcePackFormat: 34,
    pluralDataFolders: false, genericAttributePrefix: true, modifierIds: true, itemModelComponent: false, customModelDataObject: false,
    stringIngredients: false, flatEnchantments: false, listAttributeModifiers: false, inlineTextComponents: false, consumableComponent: false,
  },
  {
    id: "1.21.4", label: "1.21.4", datapackFormat: 61, resourcePackFormat: 46,
    pluralDataFolders: false, genericAttributePrefix: false, modifierIds: true, itemModelComponent: true, customModelDataObject: true,
    stringIngredients: true, flatEnchantments: false, listAttributeModifiers: false, inlineTextComponents: false, consumableComponent: true,
  },
  {
    id: "1.21.5", label: "1.21.5", datapackFormat: 71, resourcePackFormat: 55,
    pluralDataFolders: false, genericAttributePrefix: false, modifierIds: true, itemModelComponent: true, customModelDataObject: true,
    stringIngredients: true, flatEnchantments: true, listAttributeModifiers: true, inlineTextComponents: true, consumableComponent: true,
  },
];

export const DEFAULT_TARGET = "1.21.4";

export function getTarget(id: string): TargetVersion | undefined {
  return TARGET_VERSIONS.find((v) => v.id === id);
}

/** Best-effort mapping from a server's reported version (e.g. "1.21.4") to an export target. */
export function targetForServerVersion(v: string): TargetVersion | undefined {
  const exact = getTarget(v);
  if (exact) return exact;
  if (v === "1.20.5") return getTarget("1.20.6");
  if (v === "1.21") return getTarget("1.21.1");
  return undefined;
}
