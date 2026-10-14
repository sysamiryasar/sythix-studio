"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { ATTRIBUTES, EFFECTS, ENCHANTMENTS, MATERIALS, RARITIES, getMaterial } from "@/modules/forgeos/catalog";
import type { ItemData } from "@/modules/forgeos/schema";
import type { ItemRecord } from "@/modules/forgeos/content";
import type { ValidationIssue } from "@/modules/forgeos/validate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ModelViewer, type ViewerSource } from "./model-viewer";

const EMPTY_DATA: ItemData = {
  lore: [],
  glint: false,
  unbreakable: false,
  attributes: [],
  enchantments: [],
  consumeEffects: [],
  abilityIds: [],
  onHitEffects: [],
};

const SLOTS = ["mainhand", "offhand", "head", "chest", "legs", "feet", "armor", "any"] as const;

function RuntimeNote() {
  return <Badge tone="warning" title="Exported to sythix-runtime.json only. The SythiX Runtime plugin is planned and not yet available.">Requires SythiX Runtime (planned)</Badge>;
}

export function ItemEditor(props: {
  projectId: string;
  namespace: string;
  item: ItemRecord | null;
  textures: { id: string; name: string }[];
  models: { id: string; name: string; model: object }[];
  abilities: { identifier: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState(props.item?.identifier ?? "");
  const [name, setName] = useState(props.item?.name ?? "");
  const [baseMaterial, setBaseMaterial] = useState(props.item?.base_material ?? "diamond_sword");
  const [rarity, setRarity] = useState<ItemRecord["rarity"]>(props.item?.rarity ?? "rare");
  const [textureAssetId, setTextureAssetId] = useState<string | null>(props.item?.texture_asset_id ?? null);
  const [data, setData] = useState<ItemData>(props.item?.data ?? EMPTY_DATA);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const mat = getMaterial(baseMaterial)!;
  const set = <K extends keyof ItemData>(k: K, v: ItemData[K]) => setData((d) => ({ ...d, [k]: v }));
  const ro = !props.canEdit;

  useEffect(() => {
    if (!props.item) return;
    api<{ issues: ValidationIssue[] }>(`/api/v1/forge/projects/${props.projectId}/validate`)
      .then((r) => setIssues(r.issues.filter((i) => i.entity === `item:${props.item!.identifier}`)))
      .catch(() => setIssues(null));
  }, [props.item, props.projectId]);

  const viewer: ViewerSource = useMemo(() => {
    const model = props.models.find((m) => m.id === data.modelAssetId);
    if (model) {
      return {
        kind: "model",
        model: model.model as Extract<ViewerSource, { kind: "model" }>["model"],
        textureUrls: Object.fromEntries(props.textures.map((t) => [t.name, `/api/v1/forge/projects/${props.projectId}/assets/${t.id}`])),
      };
    }
    if (textureAssetId) return { kind: "sprite", textureUrl: `/api/v1/forge/projects/${props.projectId}/assets/${textureAssetId}` };
    return { kind: "none" };
  }, [data.modelAssetId, textureAssetId, props.models, props.textures, props.projectId]);

  const attrsForKind = ATTRIBUTES.filter((a) => a.kinds.includes(mat.kind));
  const enchForKind = ENCHANTMENTS.filter((e) => e.kinds.includes(mat.kind));

  const save = async () => {
    setSaving(true);
    try {
      const body = { identifier, name, baseMaterial, rarity, textureAssetId, data: { ...data, recipe: data.recipe && data.recipe.pattern.join("").trim() ? data.recipe : undefined } };
      const r = props.item
        ? await api<{ id: string }>(`/api/v1/forge/projects/${props.projectId}/items/${props.item.id}`, { method: "PUT", body })
        : await api<{ id: string }>(`/api/v1/forge/projects/${props.projectId}/items`, { body });
      toast.success("Item saved");
      if (!props.item) router.replace(`/forge/${props.projectId}/items/${r.id}`);
      else router.refresh();
    } catch (e) {
      toast.error("Item not saved", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const recipe = data.recipe ?? { pattern: ["   ", "   ", "   "], key: {} };
  const grid = [0, 1, 2].map((r) => (recipe.pattern[r] ?? "   ").padEnd(3, " ").slice(0, 3));
  const setCell = (r: number, c: number, ch: string) => {
    const rows = grid.map((row, ri) => (ri === r ? row.slice(0, c) + (ch || " ") + row.slice(c + 1) : row));
    set("recipe", { pattern: rows, key: recipe.key });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <fieldset disabled={ro} className="space-y-6">
        <Panel>
          <PanelHeader title="Basics" description={`Given in-game with /function ${props.namespace}:give/${identifier || "<id>"}`} />
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">{(p) => <Input {...p} maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Identifier" hint={`${props.namespace}:${identifier || "…"}`}>
              {(p) => <Input {...p} className="font-mono" maxLength={40} value={identifier} onChange={(e) => setIdentifier(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />}
            </Field>
            <Field label="Base item" hint="The vanilla item this is built on.">
              {(p) => (
                <Select {...p} value={baseMaterial} onChange={(e) => setBaseMaterial(e.target.value)}>
                  {(["weapon", "tool", "armor", "consumable", "misc"] as const).map((k) => (
                    <optgroup key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
                      {MATERIALS.filter((m) => m.kind === k).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Rarity">
              {(p) => (
                <Select {...p} value={rarity} onChange={(e) => setRarity(e.target.value as ItemRecord["rarity"])}>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Name colour" hint="Optional; overrides the rarity colour.">
              {(p) => (
                <div className="flex gap-2">
                  <input type="color" aria-label="Name colour picker" value={data.nameColor ?? "#ffffff"} onChange={(e) => set("nameColor", e.target.value)} className="h-9 w-12 rounded border border-border bg-surface-2" />
                  <Input {...p} className="font-mono" placeholder="rarity default" value={data.nameColor ?? ""} onChange={(e) => set("nameColor", e.target.value || undefined)} />
                </div>
              )}
            </Field>
            <div className="flex items-end gap-6 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch label="Enchantment glint" checked={data.glint} onChange={(v) => set("glint", v)} /> Glint
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch label="Unbreakable" checked={data.unbreakable} onChange={(v) => set("unbreakable", v)} /> Unbreakable
              </label>
            </div>
            <Field label="Durability" hint="Max uses. Leave empty for the base item's default.">
              {(p) => <Input {...p} type="number" min={1} max={100000} value={data.durability ?? ""} onChange={(e) => set("durability", e.target.value ? Number(e.target.value) : undefined)} />}
            </Field>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Visuals" description="Textures and models are managed in the Assets tab." />
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Texture" hint={!mat.simpleModel ? "This base item needs target 1.21.4+ for custom textures." : undefined}>
              {(p) => (
                <Select {...p} value={textureAssetId ?? ""} onChange={(e) => setTextureAssetId(e.target.value || null)}>
                  <option value="">Vanilla texture</option>
                  {props.textures.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="3D model" hint="Optional JSON model; overrides the flat texture.">
              {(p) => (
                <Select {...p} value={data.modelAssetId ?? ""} onChange={(e) => set("modelAssetId", e.target.value || undefined)}>
                  <option value="">Flat ({mat.parent.replace("item/", "")})</option>
                  {props.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Attributes"
            description="Attack values are entered as shown in the tooltip; the exporter converts them to modifiers relative to the player's base."
            actions={
              <Button size="sm" variant="outline" onClick={() => set("attributes", [...data.attributes, { attribute: attrsForKind[0]?.id ?? "max_health", value: attrsForKind[0]?.displayBase ?? 1, slot: mat.armorSlot ?? "mainhand", operation: "add_value" }])} disabled={data.attributes.length >= 12}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          />
          <PanelBody className="space-y-2">
            {data.attributes.length === 0 && <p className="text-xs text-muted">No custom attributes. The base item&apos;s defaults apply.</p>}
            {data.attributes.map((a, i) => {
              const def = ATTRIBUTES.find((x) => x.id === a.attribute)!;
              const upd = (patch: Partial<typeof a>) => set("attributes", data.attributes.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr_auto]">
                  <Select aria-label="Attribute" value={a.attribute} onChange={(e) => upd({ attribute: e.target.value })}>
                    {ATTRIBUTES.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label={`${def.label} value`} type="number" step={def.step} min={def.min} max={def.max} value={a.value} onChange={(e) => upd({ value: Number(e.target.value) })} />
                  <Select aria-label="Slot" value={a.slot} onChange={(e) => upd({ slot: e.target.value as (typeof SLOTS)[number] })}>
                    {SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Operation" value={a.operation} onChange={(e) => upd({ operation: e.target.value as typeof a.operation })}>
                    <option value="add_value">Add</option>
                    <option value="add_multiplied_base">× base</option>
                    <option value="add_multiplied_total">× total</option>
                  </Select>
                  <Button size="icon" variant="ghost" aria-label="Remove attribute" onClick={() => set("attributes", data.attributes.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Enchantments"
            actions={
              <Button size="sm" variant="outline" onClick={() => set("enchantments", [...data.enchantments, { id: (enchForKind[0] ?? ENCHANTMENTS[0]!).id, level: 1 }])} disabled={data.enchantments.length >= 16}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          />
          <PanelBody className="space-y-2">
            {data.enchantments.length === 0 && <p className="text-xs text-muted">No enchantments.</p>}
            {data.enchantments.map((en, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2">
                <Select aria-label="Enchantment" value={en.id} onChange={(e) => set("enchantments", data.enchantments.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}>
                  {ENCHANTMENTS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                      {x.kinds.includes(mat.kind) ? "" : " (no effect on this item)"}
                    </option>
                  ))}
                </Select>
                <Input aria-label="Level" type="number" min={1} max={255} value={en.level} onChange={(e) => set("enchantments", data.enchantments.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Remove enchantment" onClick={() => set("enchantments", data.enchantments.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </PanelBody>
        </Panel>

        {mat.kind === "consumable" && (
          <Panel>
            <PanelHeader title="Food and consume effects" description="Vanilla-supported for consumable base items." />
            <PanelBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Nutrition">{(p) => <Input {...p} type="number" min={0} max={20} value={data.food?.nutrition ?? 4} onChange={(e) => set("food", { nutrition: Number(e.target.value), saturation: data.food?.saturation ?? 2.4, canAlwaysEat: data.food?.canAlwaysEat ?? false })} />}</Field>
                <Field label="Saturation">{(p) => <Input {...p} type="number" step={0.1} min={0} max={20} value={data.food?.saturation ?? 2.4} onChange={(e) => set("food", { nutrition: data.food?.nutrition ?? 4, saturation: Number(e.target.value), canAlwaysEat: data.food?.canAlwaysEat ?? false })} />}</Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Switch label="Can always eat" checked={data.food?.canAlwaysEat ?? false} onChange={(v) => set("food", { nutrition: data.food?.nutrition ?? 4, saturation: data.food?.saturation ?? 2.4, canAlwaysEat: v })} /> Always edible
                </label>
              </div>
              {data.consumeEffects.map((ef, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_120px_auto] gap-2">
                  <Select aria-label="Effect" value={ef.effect} onChange={(e) => set("consumeEffects", data.consumeEffects.map((x, j) => (j === i ? { ...x, effect: e.target.value as typeof ef.effect } : x)))}>
                    {EFFECTS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </Select>
                  <Input aria-label="Amplifier" type="number" min={0} max={9} value={ef.amplifier} onChange={(e) => set("consumeEffects", data.consumeEffects.map((x, j) => (j === i ? { ...x, amplifier: Number(e.target.value) } : x)))} />
                  <Input aria-label="Duration (ticks)" type="number" min={1} max={72000} value={ef.durationTicks} onChange={(e) => set("consumeEffects", data.consumeEffects.map((x, j) => (j === i ? { ...x, durationTicks: Number(e.target.value) } : x)))} />
                  <Button size="icon" variant="ghost" aria-label="Remove effect" onClick={() => set("consumeEffects", data.consumeEffects.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set("consumeEffects", [...data.consumeEffects, { effect: "regeneration", amplifier: 0, durationTicks: 100 }])} disabled={data.consumeEffects.length >= 6}>
                <Plus className="h-3.5 w-3.5" /> Add effect (amplifier · ticks)
              </Button>
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Lore" actions={<Button size="sm" variant="outline" onClick={() => set("lore", [...data.lore, { text: "", italic: false }])} disabled={data.lore.length >= 8}><Plus className="h-3.5 w-3.5" /> Line</Button>} />
          <PanelBody className="space-y-2">
            {data.lore.length === 0 && <p className="text-xs text-muted">No lore lines.</p>}
            {data.lore.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_48px_auto_auto] items-center gap-2">
                <Input aria-label={`Lore line ${i + 1}`} maxLength={120} value={l.text} onChange={(e) => set("lore", data.lore.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <input type="color" aria-label="Line colour" value={l.color ?? "#aaaaaa"} onChange={(e) => set("lore", data.lore.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-9 w-12 rounded border border-border bg-surface-2" />
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" checked={l.italic ?? false} onChange={(e) => set("lore", data.lore.map((x, j) => (j === i ? { ...x, italic: e.target.checked } : x)))} /> italic
                </label>
                <Button size="icon" variant="ghost" aria-label="Remove line" onClick={() => set("lore", data.lore.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Crafting recipe" description="Shaped crafting-table recipe. Use a symbol per ingredient; leave cells blank for empty slots." actions={data.recipe && <Button size="sm" variant="ghost" onClick={() => set("recipe", undefined)}>Remove recipe</Button>} />
          <PanelBody className="flex flex-col gap-6 sm:flex-row">
            <div className="grid w-fit grid-cols-3 gap-1">
              {grid.map((row, r) =>
                [0, 1, 2].map((c) => (
                  <input
                    key={`${r}${c}`}
                    aria-label={`Recipe slot row ${r + 1} column ${c + 1}`}
                    maxLength={1}
                    value={row[c] === " " ? "" : row[c]}
                    onChange={(e) => setCell(r, c, e.target.value.toUpperCase().replace(/[^A-Z#]/g, ""))}
                    className="h-12 w-12 rounded border border-border bg-surface-2 text-center font-mono text-lg text-fg focus:border-accent focus:outline-none"
                  />
                )),
              )}
            </div>
            <div className="flex-1 space-y-2">
              {[...new Set(grid.join("").replace(/ /g, ""))].map((ch) => (
                <div key={ch} className="grid grid-cols-[32px_1fr] items-center gap-2">
                  <span className="text-center font-mono text-sm">{ch}</span>
                  <Input
                    aria-label={`Ingredient for ${ch}`}
                    className="font-mono"
                    placeholder="vanilla item id, e.g. diamond"
                    value={recipe.key[ch] ?? ""}
                    onChange={(e) => set("recipe", { pattern: grid, key: { ...recipe.key, [ch]: e.target.value.toLowerCase().replace(/^minecraft:/, "").replace(/[^a-z0-9_]/g, "") } })}
                  />
                </div>
              ))}
              <p className="text-[11px] text-faint">Trailing empty rows and columns are kept as-is; the validator checks every symbol has an ingredient.</p>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Abilities and on-hit effects" actions={<RuntimeNote />} description="These need server-side logic that vanilla Minecraft doesn't have. They are validated and exported to sythix-runtime.json, never into the datapack." />
          <PanelBody className="space-y-3">
            {props.abilities.length === 0 ? (
              <p className="text-xs text-muted">No abilities in this project yet. Create them in the Abilities tab.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {props.abilities.map((a) => {
                  const on = data.abilityIds.includes(a.identifier);
                  return (
                    <button
                      key={a.identifier}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && data.abilityIds.length >= 4}
                      onClick={() => set("abilityIds", on ? data.abilityIds.filter((x) => x !== a.identifier) : [...data.abilityIds, a.identifier])}
                      className={cn("rounded-md border px-2.5 py-1 text-xs", on ? "border-accent bg-accent-soft text-fg" : "border-border text-muted hover:text-fg")}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            )}
            {data.onHitEffects.map((ef, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_100px_90px_auto]">
                <Select aria-label="On-hit effect" value={ef.effect} onChange={(e) => set("onHitEffects", data.onHitEffects.map((x, j) => (j === i ? { ...x, effect: e.target.value as typeof ef.effect } : x)))}>
                  {EFFECTS.map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
                <Input aria-label="Amplifier" type="number" min={0} max={9} value={ef.amplifier} onChange={(e) => set("onHitEffects", data.onHitEffects.map((x, j) => (j === i ? { ...x, amplifier: Number(e.target.value) } : x)))} />
                <Input aria-label="Duration ticks" type="number" min={1} max={1200} value={ef.durationTicks} onChange={(e) => set("onHitEffects", data.onHitEffects.map((x, j) => (j === i ? { ...x, durationTicks: Number(e.target.value) } : x)))} />
                <Input aria-label="Chance 0-1" type="number" step={0.05} min={0} max={1} value={ef.chance} onChange={(e) => set("onHitEffects", data.onHitEffects.map((x, j) => (j === i ? { ...x, chance: Number(e.target.value) } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set("onHitEffects", data.onHitEffects.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set("onHitEffects", [...data.onHitEffects, { effect: "slowness", amplifier: 0, durationTicks: 60, chance: 0.25 }])} disabled={data.onHitEffects.length >= 4}>
              <Plus className="h-3.5 w-3.5" /> On-hit effect (amp · ticks · chance)
            </Button>
          </PanelBody>
        </Panel>
      </fieldset>

      <div className="space-y-4 xl:sticky xl:top-16 xl:h-fit">
        <ModelViewer source={viewer} className="aspect-square" />
        <Panel>
          <PanelHeader title="Validation" description={props.item ? "Results for the last saved version." : "Save to validate."} />
          <PanelBody className="space-y-2">
            {issues === null && <p className="text-xs text-muted">{props.item ? "Checking…" : "Not saved yet."}</p>}
            {issues?.length === 0 && (
              <p className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> No issues for {props.namespace}:{props.item?.identifier}
              </p>
            )}
            {issues?.map((i, k) => (
              <p key={k} className={cn("flex gap-1.5 text-xs", i.severity === "error" ? "text-danger" : i.severity === "warning" ? "text-warning" : "text-muted")}>
                {i.severity === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {i.message}
              </p>
            ))}
          </PanelBody>
        </Panel>
        {props.canEdit && (
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1 justify-center" loading={saving} disabled={!name.trim() || identifier.length < 2} onClick={save}>
              Save item
            </Button>
            {props.item && (
              <Button variant="ghost" aria-label="Delete item" onClick={() => setDeleting(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${props.item?.name}?`}
        description="If the item is part of a saved revision, you can restore it from History."
        confirmLabel="Delete item"
        danger
        onConfirm={async () => {
          try {
            await api(`/api/v1/forge/projects/${props.projectId}/items/${props.item!.id}`, { method: "DELETE" });
            router.push(`/forge/${props.projectId}`);
            router.refresh();
          } catch (e) {
            toast.error("Delete failed", (e as Error).message);
          }
        }}
      />
    </div>
  );
}
