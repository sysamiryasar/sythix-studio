import type { z } from "zod";
import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { all, one, run, parseJson } from "@/lib/db/sql";
import { recordAudit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/authz/check";
import type { WorkspacePermission } from "@/lib/authz/roles";
import { slugify } from "@/lib/validation";
import { awardAchievement } from "@/modules/nexusid/achievements";
import { getTarget } from "./versions";
import { loadProjectContent, snapshotOf, type ProjectContent, type ProjectRow } from "./content";
import { namespaceSchema, type projectInput } from "./schema";

/** Loads a project and checks the user's permission in its workspace. Non-members get not_found. */
export async function requireProject(ctx: AppContext, user: SessionUser, projectId: string, p: WorkspacePermission): Promise<ProjectRow> {
  const project = await one<ProjectRow>(ctx.db, `SELECT * FROM projects WHERE id = ?`, projectId);
  if (!project) throw notFound("Project");
  await requireWorkspace(ctx, user, project.workspace_id, p);
  return project;
}

export async function listProjects(ctx: AppContext, user: SessionUser, workspaceId: string, includeArchived = false) {
  await requireWorkspace(ctx, user, workspaceId, "project.view");
  return all<ProjectRow & { item_count: number }>(
    ctx.db,
    `SELECT p.*, (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id) AS item_count FROM projects p
      WHERE p.workspace_id = ? AND (p.archived_at IS NULL OR ?) ORDER BY p.folder, p.updated_at DESC`,
    workspaceId,
    includeArchived ? 1 : 0,
  );
}

export async function createProject(ctx: AppContext, user: SessionUser, workspaceId: string, input: z.infer<typeof projectInput>): Promise<ProjectRow> {
  await requireWorkspace(ctx, user, workspaceId, "project.create");
  if (!getTarget(input.targetVersion)) throw badRequest(`Unsupported target version ${input.targetVersion}.`);
  let slug = slugify(input.name);
  if (await one(ctx.db, `SELECT 1 FROM projects WHERE workspace_id = ? AND slug = ?`, workspaceId, slug)) slug = `${slug}-${newId("x").slice(-5)}`;
  const namespace = namespaceSchema.parse(input.namespace ?? (slug.replace(/-/g, "_").replace(/^minecraft$/, "minecraft_custom").slice(0, 24) || "sythix"));
  const id = newId("prj");
  const now = ctx.now();
  await ctx.db.batch([
    ctx.db
      .prepare(
        `INSERT INTO projects (id, workspace_id, name, slug, namespace, description, target_version, folder, visibility, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, workspaceId, input.name, slug, namespace, input.description, input.targetVersion, input.folder, input.visibility, user.id, now, now),
    ctx.db.prepare(`INSERT INTO resource_packs (project_id, description, updated_at) VALUES (?, ?, ?)`).bind(id, input.description, now),
  ]);
  await recordAudit(ctx, { actorId: user.id, action: "forge.project_created", targetType: "project", targetId: id, workspaceId });
  await awardAchievement(ctx, user.id, "first_project");
  return (await one<ProjectRow>(ctx.db, `SELECT * FROM projects WHERE id = ?`, id))!;
}

export async function updateProject(ctx: AppContext, user: SessionUser, projectId: string, input: Partial<z.infer<typeof projectInput>> & { packDescription?: string }) {
  const p = await requireProject(ctx, user, projectId, "project.edit");
  if (input.targetVersion && !getTarget(input.targetVersion)) throw badRequest(`Unsupported target version ${input.targetVersion}.`);
  const namespace = input.namespace ? namespaceSchema.parse(input.namespace) : p.namespace;
  await run(
    ctx.db,
    `UPDATE projects SET name = ?, description = ?, namespace = ?, target_version = ?, folder = ?, visibility = ?, updated_at = ? WHERE id = ?`,
    input.name ?? p.name,
    input.description ?? p.description,
    namespace,
    input.targetVersion ?? p.target_version,
    input.folder ?? p.folder,
    input.visibility ?? p.visibility,
    ctx.now(),
    projectId,
  );
  if (input.packDescription !== undefined) {
    await run(ctx.db, `UPDATE resource_packs SET description = ?, updated_at = ? WHERE project_id = ?`, input.packDescription.slice(0, 200), ctx.now(), projectId);
  }
}

export async function touchProject(ctx: AppContext, projectId: string): Promise<void> {
  await run(ctx.db, `UPDATE projects SET updated_at = ? WHERE id = ?`, ctx.now(), projectId);
}

export async function setArchived(ctx: AppContext, user: SessionUser, projectId: string, archived: boolean) {
  const p = await requireProject(ctx, user, projectId, "project.delete");
  await run(ctx.db, `UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?`, archived ? ctx.now() : null, ctx.now(), projectId);
  await recordAudit(ctx, { actorId: user.id, action: archived ? "forge.project_archived" : "forge.project_restored", targetType: "project", targetId: projectId, workspaceId: p.workspace_id });
}

// Revisions -------------------------------------------------------------------

/** Creates a revision snapshot when content changed since the last one; returns the current revision number. */
export async function ensureRevision(ctx: AppContext, user: SessionUser, c: ProjectContent, message: string): Promise<number> {
  const snap = snapshotOf(c);
  const last = await one<{ revision: number; snapshot: string }>(
    ctx.db,
    `SELECT revision, snapshot FROM project_versions WHERE project_id = ? ORDER BY revision DESC LIMIT 1`,
    c.project.id,
  );
  if (last && last.snapshot === snap) return last.revision;
  const revision = (last?.revision ?? 0) + 1;
  await ctx.db.batch([
    ctx.db
      .prepare(`INSERT INTO project_versions (id, project_id, revision, message, snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId("rev"), c.project.id, revision, message.slice(0, 200), snap, user.id, ctx.now()),
    ctx.db.prepare(`UPDATE projects SET current_revision = ? WHERE id = ?`).bind(revision, c.project.id),
  ]);
  return revision;
}

export async function saveRevision(ctx: AppContext, user: SessionUser, projectId: string, message: string): Promise<number> {
  await requireProject(ctx, user, projectId, "project.edit");
  const c = (await loadProjectContent(ctx, projectId))!;
  return ensureRevision(ctx, user, c, message || "Saved revision");
}

export async function listRevisions(ctx: AppContext, projectId: string) {
  return all<{ revision: number; message: string; created_at: number; author: string }>(
    ctx.db,
    `SELECT v.revision, v.message, v.created_at, u.username AS author FROM project_versions v JOIN users u ON u.id = v.created_by
      WHERE v.project_id = ? ORDER BY v.revision DESC LIMIT 100`,
    projectId,
  );
}

interface Snapshot {
  items: { identifier: string; name: string; base_material: string; kind: string; rarity: string; texture_asset_id: string | null; data: unknown }[];
  abilities: { identifier: string; name: string; template: string; trigger_kind: string; cooldown_ticks: number; permission: string | null; params: unknown }[];
  sets: { identifier: string; name: string; data: unknown }[];
}

/** Restores items, abilities and sets from a revision (assets are kept; missing ones surface in validation). */
export async function restoreRevision(ctx: AppContext, user: SessionUser, projectId: string, revision: number): Promise<number> {
  const p = await requireProject(ctx, user, projectId, "project.edit");
  const row = await one<{ snapshot: string }>(ctx.db, `SELECT snapshot FROM project_versions WHERE project_id = ? AND revision = ?`, projectId, revision);
  if (!row) throw notFound("Revision");
  const snap = parseJson<Snapshot>(row.snapshot, { items: [], abilities: [], sets: [] });
  const assetIds = new Set((await all<{ id: string }>(ctx.db, `SELECT id FROM assets WHERE project_id = ?`, projectId)).map((a) => a.id));
  const now = ctx.now();
  await ctx.db.batch([
    ctx.db.prepare(`DELETE FROM items WHERE project_id = ?`).bind(projectId),
    ctx.db.prepare(`DELETE FROM abilities WHERE project_id = ?`).bind(projectId),
    ctx.db.prepare(`DELETE FROM equipment_sets WHERE project_id = ?`).bind(projectId),
    ...snap.items.map((i) =>
      ctx.db
        .prepare(`INSERT INTO items (id, project_id, identifier, name, base_material, kind, rarity, texture_asset_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId("itm"), projectId, i.identifier, i.name, i.base_material, i.kind, i.rarity, i.texture_asset_id && assetIds.has(i.texture_asset_id) ? i.texture_asset_id : null, JSON.stringify(i.data), now, now),
    ),
    ...snap.abilities.map((a) =>
      ctx.db
        .prepare(`INSERT INTO abilities (id, project_id, identifier, name, template, trigger_kind, cooldown_ticks, permission, params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId("abl"), projectId, a.identifier, a.name, a.template, a.trigger_kind, a.cooldown_ticks, a.permission, JSON.stringify(a.params), now, now),
    ),
    ...snap.sets.map((s) =>
      ctx.db
        .prepare(`INSERT INTO equipment_sets (id, project_id, identifier, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId("set"), projectId, s.identifier, s.name, JSON.stringify(s.data), now, now),
    ),
  ]);
  await touchProject(ctx, projectId);
  await recordAudit(ctx, { actorId: user.id, action: "forge.revision_restored", targetType: "project", targetId: projectId, workspaceId: p.workspace_id, metadata: { revision } });
  const c = (await loadProjectContent(ctx, projectId))!;
  return ensureRevision(ctx, user, c, `Restored revision ${revision}`);
}

/** Copies a project, including its asset files in R2, into the same workspace. */
export async function duplicateProject(ctx: AppContext, user: SessionUser, projectId: string): Promise<ProjectRow> {
  const src = await requireProject(ctx, user, projectId, "project.view");
  await requireWorkspace(ctx, user, src.workspace_id, "project.create");
  const c = (await loadProjectContent(ctx, projectId))!;
  const copy = await createProject(ctx, user, src.workspace_id, {
    name: `${src.name} (copy)`.slice(0, 64),
    description: src.description,
    targetVersion: src.target_version,
    folder: src.folder,
    visibility: "private",
    namespace: `${src.namespace.slice(0, 19)}_copy`,
  });
  const assetMap = new Map<string, string>();
  for (const a of c.assets) {
    const obj = await ctx.bucket.get(a.r2_key);
    if (!obj) continue;
    const newAssetId = newId("ast");
    const key = `projects/${copy.id}/${a.kind}/${newAssetId}`;
    await ctx.bucket.put(key, await obj.arrayBuffer(), { httpMetadata: { contentType: a.content_type } });
    await run(
      ctx.db,
      `INSERT INTO assets (id, project_id, kind, name, r2_key, content_type, size_bytes, width, height, sha256, metadata, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newAssetId, copy.id, a.kind, a.name, key, a.content_type, a.size_bytes, a.width, a.height, a.sha256, JSON.stringify(a.metadata), user.id, ctx.now(),
    );
    assetMap.set(a.id, newAssetId);
  }
  const now = ctx.now();
  await ctx.db.batch([
    ...c.items.map((i) =>
      ctx.db
        .prepare(`INSERT INTO items (id, project_id, identifier, name, base_material, kind, rarity, texture_asset_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId("itm"), copy.id, i.identifier, i.name, i.base_material, i.kind, i.rarity, i.texture_asset_id ? (assetMap.get(i.texture_asset_id) ?? null) : null,
          JSON.stringify({ ...i.data, modelAssetId: i.data.modelAssetId ? assetMap.get(i.data.modelAssetId) : undefined }), now, now),
    ),
    ...c.abilities.map((a) =>
      ctx.db
        .prepare(`INSERT INTO abilities (id, project_id, identifier, name, template, trigger_kind, cooldown_ticks, permission, params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(newId("abl"), copy.id, a.identifier, a.name, a.template, a.trigger_kind, a.cooldown_ticks, a.permission, JSON.stringify(a.params), now, now),
    ),
    ...c.sets.map((s) =>
      ctx.db.prepare(`INSERT INTO equipment_sets (id, project_id, identifier, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(newId("set"), copy.id, s.identifier, s.name, JSON.stringify(s.data), now, now),
    ),
  ]);
  return copy;
}

export function assertUniqueConflict(err: unknown, what: string): never {
  if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) throw conflict(`${what} with that identifier already exists in this project.`);
  throw err;
}
