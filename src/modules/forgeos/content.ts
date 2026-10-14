import type { AppContext } from "@/lib/context";
import { all, one, parseJson } from "@/lib/db/sql";
import type { AbilityTemplate, ItemData } from "./schema";
import { itemDataSchema } from "./schema";

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  namespace: string;
  description: string;
  target_version: string;
  folder: string;
  visibility: "private" | "public";
  current_revision: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

export interface ItemRecord {
  id: string;
  identifier: string;
  name: string;
  base_material: string;
  kind: string;
  rarity: "common" | "uncommon" | "rare" | "epic";
  texture_asset_id: string | null;
  data: ItemData;
}

export interface AbilityRecord {
  id: string;
  identifier: string;
  name: string;
  template: AbilityTemplate;
  trigger_kind: string;
  cooldown_ticks: number;
  permission: string | null;
  params: Record<string, unknown>;
}

export interface SetRecord {
  id: string;
  identifier: string;
  name: string;
  data: { pieces: string[]; bonuses: { piecesRequired: number; effects: Record<string, unknown>[]; conditions: Record<string, unknown>[] }[] };
}

export interface AssetRecord {
  id: string;
  kind: "texture" | "model";
  name: string;
  r2_key: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  metadata: Record<string, unknown>;
}

export interface ProjectContent {
  project: ProjectRow;
  items: ItemRecord[];
  abilities: AbilityRecord[];
  sets: SetRecord[];
  assets: AssetRecord[];
  pack: { description: string; icon_asset_id: string | null };
}

export async function loadProjectContent(ctx: AppContext, projectId: string): Promise<ProjectContent | null> {
  const project = await one<ProjectRow>(ctx.db, `SELECT * FROM projects WHERE id = ?`, projectId);
  if (!project) return null;
  const [items, abilities, sets, assets, pack] = await Promise.all([
    all<Omit<ItemRecord, "data"> & { data: string }>(
      ctx.db,
      `SELECT id, identifier, name, base_material, kind, rarity, texture_asset_id, data FROM items WHERE project_id = ? ORDER BY identifier`,
      projectId,
    ),
    all<Omit<AbilityRecord, "params"> & { params: string }>(
      ctx.db,
      `SELECT id, identifier, name, template, trigger_kind, cooldown_ticks, permission, params FROM abilities WHERE project_id = ? ORDER BY identifier`,
      projectId,
    ),
    all<Omit<SetRecord, "data"> & { data: string }>(ctx.db, `SELECT id, identifier, name, data FROM equipment_sets WHERE project_id = ? ORDER BY identifier`, projectId),
    all<Omit<AssetRecord, "metadata"> & { metadata: string }>(
      ctx.db,
      `SELECT id, kind, name, r2_key, content_type, size_bytes, width, height, sha256, metadata FROM assets WHERE project_id = ? ORDER BY kind, name`,
      projectId,
    ),
    one<{ description: string; icon_asset_id: string | null }>(ctx.db, `SELECT description, icon_asset_id FROM resource_packs WHERE project_id = ?`, projectId),
  ]);
  return {
    project,
    items: items.map((i) => ({ ...i, data: itemDataSchema.parse(parseJson(i.data, {})) })),
    abilities: abilities.map((a) => ({ ...a, params: parseJson(a.params, {}) })),
    sets: sets.map((s) => ({ ...s, data: parseJson(s.data, { pieces: [], bonuses: [] }) })),
    assets: assets.map((a) => ({ ...a, metadata: parseJson(a.metadata, {}) })),
    pack: pack ?? { description: project.description, icon_asset_id: null },
  };
}

/** Stable, timestamp-free representation of a project's content, used for revisions and change detection. */
export function snapshotOf(c: ProjectContent): string {
  return JSON.stringify({
    project: { name: c.project.name, namespace: c.project.namespace, description: c.project.description, target_version: c.project.target_version },
    items: c.items.map(({ id: _id, ...rest }) => rest),
    abilities: c.abilities.map(({ id: _id, ...rest }) => rest),
    sets: c.sets.map(({ id: _id, ...rest }) => rest),
    assets: c.assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name, sha256: a.sha256 })),
    pack: c.pack,
  });
}
