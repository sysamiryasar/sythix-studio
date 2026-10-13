import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { one, run } from "@/lib/db/sql";
import { sha256Hex } from "@/lib/security/crypto";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/audit";
import { parseModelJson, validateTexture } from "./models";
import { requireProject, touchProject } from "./projects";

const NAME_RE = /^[a-z0-9_]{1,40}$/;
const MAX_ASSETS_PER_PROJECT = 200;

/**
 * Stores an uploaded texture (PNG) or model (JSON). Content is validated from
 * the bytes themselves — the client-supplied filename and MIME type are ignored.
 * Files are stored under server-generated R2 keys, so names can never traverse paths.
 */
export async function uploadAsset(ctx: AppContext, user: SessionUser, projectId: string, kind: "texture" | "model", name: string, bytes: Uint8Array) {
  const project = await requireProject(ctx, user, projectId, "project.edit");
  await enforceRateLimit(ctx, RATE_LIMITS.upload, user.id);
  if (!NAME_RE.test(name)) throw badRequest("Asset names use lowercase letters, numbers and underscores (max 40).");
  const count = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM assets WHERE project_id = ?`, projectId);
  if ((count?.n ?? 0) >= MAX_ASSETS_PER_PROJECT) throw badRequest(`Projects can hold at most ${MAX_ASSETS_PER_PROJECT} assets.`);
  if (await one(ctx.db, `SELECT 1 FROM assets WHERE project_id = ? AND kind = ? AND name = ?`, projectId, kind, name)) throw conflict(`A ${kind} named "${name}" already exists.`);

  let width: number | null = null;
  let height: number | null = null;
  let metadata: Record<string, unknown> = {};
  let contentType: string;
  if (kind === "texture") {
    const r = validateTexture(bytes);
    if (!r.ok) throw badRequest(r.error);
    width = r.info.width;
    height = r.info.height;
    contentType = "image/png";
  } else {
    const r = parseModelJson(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    if (!r.ok) throw badRequest(r.error);
    metadata = { model: r.value.model, textureRefs: r.value.textureRefs, elementCount: r.value.elementCount };
    contentType = "application/json";
  }

  const id = newId("ast");
  const key = `projects/${projectId}/${kind}/${id}`;
  await ctx.bucket.put(key, bytes, { httpMetadata: { contentType } });
  await run(
    ctx.db,
    `INSERT INTO assets (id, project_id, kind, name, r2_key, content_type, size_bytes, width, height, sha256, metadata, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, projectId, kind, name, key, contentType, bytes.byteLength, width, height, await sha256Hex(bytes), JSON.stringify(metadata), user.id, ctx.now(),
  );
  await touchProject(ctx, projectId);
  await recordAudit(ctx, { actorId: user.id, action: "forge.asset_uploaded", targetType: "asset", targetId: id, workspaceId: project.workspace_id, metadata: { kind, name, bytes: bytes.byteLength } });
  return { id, name, kind, width, height };
}

export async function deleteAsset(ctx: AppContext, user: SessionUser, projectId: string, assetId: string) {
  await requireProject(ctx, user, projectId, "project.edit");
  const a = await one<{ r2_key: string }>(ctx.db, `SELECT r2_key FROM assets WHERE id = ? AND project_id = ?`, assetId, projectId);
  if (!a) throw notFound("Asset");
  await run(ctx.db, `DELETE FROM assets WHERE id = ?`, assetId);
  await ctx.bucket.delete(a.r2_key);
  await touchProject(ctx, projectId);
}

/** Streams an asset to an authorised project member. Served with a fixed, safe content type. */
export async function readAsset(ctx: AppContext, user: SessionUser, projectId: string, assetId: string) {
  await requireProject(ctx, user, projectId, "project.view");
  const a = await one<{ r2_key: string; content_type: string; kind: string }>(ctx.db, `SELECT r2_key, content_type, kind FROM assets WHERE id = ? AND project_id = ?`, assetId, projectId);
  if (!a) throw notFound("Asset");
  const obj = await ctx.bucket.get(a.r2_key);
  if (!obj) throw notFound("Asset file");
  return { body: obj.body, contentType: a.kind === "texture" ? "image/png" : "application/json" };
}
