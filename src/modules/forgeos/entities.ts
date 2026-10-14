import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { badRequest, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { one, run } from "@/lib/db/sql";
import { getMaterial } from "./catalog";
import { abilityInput, equipmentSetInput, itemInput, parseAbilityParams, type AbilityInput, type EquipmentSetInput, type ItemInput } from "./schema";
import { assertUniqueConflict, requireProject, touchProject } from "./projects";

async function assertAsset(ctx: AppContext, projectId: string, assetId: string | null | undefined, kind: "texture" | "model") {
  if (!assetId) return;
  if (!(await one(ctx.db, `SELECT 1 FROM assets WHERE id = ? AND project_id = ? AND kind = ?`, assetId, projectId, kind))) throw badRequest(`The selected ${kind} does not belong to this project.`);
}

export async function upsertItem(ctx: AppContext, user: SessionUser, projectId: string, raw: ItemInput, itemId?: string): Promise<{ id: string }> {
  await requireProject(ctx, user, projectId, "project.edit");
  const input = itemInput.parse(raw);
  const mat = getMaterial(input.baseMaterial)!;
  await assertAsset(ctx, projectId, input.textureAssetId, "texture");
  await assertAsset(ctx, projectId, input.data.modelAssetId, "model");
  const now = ctx.now();
  try {
    if (itemId) {
      const n = await run(
        ctx.db,
        `UPDATE items SET identifier = ?, name = ?, base_material = ?, kind = ?, rarity = ?, texture_asset_id = ?, data = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
        input.identifier, input.name, input.baseMaterial, mat.kind, input.rarity, input.textureAssetId ?? null, JSON.stringify(input.data), now, itemId, projectId,
      );
      if (!n) throw notFound("Item");
    } else {
      itemId = newId("itm");
      await run(
        ctx.db,
        `INSERT INTO items (id, project_id, identifier, name, base_material, kind, rarity, texture_asset_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        itemId, projectId, input.identifier, input.name, input.baseMaterial, mat.kind, input.rarity, input.textureAssetId ?? null, JSON.stringify(input.data), now, now,
      );
    }
  } catch (err) {
    assertUniqueConflict(err, "An item");
  }
  await touchProject(ctx, projectId);
  return { id: itemId! };
}

export async function upsertAbility(ctx: AppContext, user: SessionUser, projectId: string, raw: AbilityInput, abilityId?: string): Promise<{ id: string }> {
  await requireProject(ctx, user, projectId, "project.edit");
  const input = abilityInput.parse(raw);
  const params = parseAbilityParams(input.template, input.params);
  const now = ctx.now();
  try {
    if (abilityId) {
      const n = await run(
        ctx.db,
        `UPDATE abilities SET identifier = ?, name = ?, template = ?, trigger_kind = ?, cooldown_ticks = ?, permission = ?, params = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
        input.identifier, input.name, input.template, input.trigger, input.cooldownTicks, input.permission ?? null, JSON.stringify(params), now, abilityId, projectId,
      );
      if (!n) throw notFound("Ability");
    } else {
      abilityId = newId("abl");
      await run(
        ctx.db,
        `INSERT INTO abilities (id, project_id, identifier, name, template, trigger_kind, cooldown_ticks, permission, params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        abilityId, projectId, input.identifier, input.name, input.template, input.trigger, input.cooldownTicks, input.permission ?? null, JSON.stringify(params), now, now,
      );
    }
  } catch (err) {
    assertUniqueConflict(err, "An ability");
  }
  await touchProject(ctx, projectId);
  return { id: abilityId! };
}

export async function upsertSet(ctx: AppContext, user: SessionUser, projectId: string, raw: EquipmentSetInput, setId?: string): Promise<{ id: string }> {
  await requireProject(ctx, user, projectId, "project.edit");
  const input = equipmentSetInput.parse(raw);
  const now = ctx.now();
  try {
    if (setId) {
      const n = await run(ctx.db, `UPDATE equipment_sets SET identifier = ?, name = ?, data = ?, updated_at = ? WHERE id = ? AND project_id = ?`, input.identifier, input.name, JSON.stringify(input.data), now, setId, projectId);
      if (!n) throw notFound("Equipment set");
    } else {
      setId = newId("set");
      await run(ctx.db, `INSERT INTO equipment_sets (id, project_id, identifier, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, setId, projectId, input.identifier, input.name, JSON.stringify(input.data), now, now);
    }
  } catch (err) {
    assertUniqueConflict(err, "A set");
  }
  await touchProject(ctx, projectId);
  return { id: setId! };
}

const TABLES = { item: "items", ability: "abilities", set: "equipment_sets" } as const;

export async function deleteEntity(ctx: AppContext, user: SessionUser, projectId: string, kind: keyof typeof TABLES, id: string): Promise<void> {
  await requireProject(ctx, user, projectId, "project.edit");
  // Table name comes from a fixed map, never from input.
  if (!(await run(ctx.db, `DELETE FROM ${TABLES[kind]} WHERE id = ? AND project_id = ?`, id, projectId))) throw notFound(kind);
  await touchProject(ctx, projectId);
}
