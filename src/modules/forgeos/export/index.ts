import type { AppContext } from "@/lib/context";
import type { SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { one, run } from "@/lib/db/sql";
import { sha256Hex } from "@/lib/security/crypto";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { RELEASE } from "@/generated/release";
import { awardAchievement } from "@/modules/nexusid/achievements";
import { getTarget, type TargetVersion } from "../versions";
import { loadProjectContent, type ProjectContent } from "../content";
import { blocks, validateContent, type ExportFormat, type ValidationReport } from "../validate";
import { putJson, type FileMap } from "./common";
import { generateDatapack } from "./datapack";
import { generateResourcePack } from "./resourcepack";
import { generateRuntimeConfig } from "./runtime";
import { deterministicZip } from "./zip";
import { verifyPack } from "./verify";
import { ensureRevision } from "../projects";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; description: string }[] = [
  { id: "datapack", label: "Datapack", description: "Vanilla loot tables, give functions and recipes. Deployable to ServerOS servers." },
  { id: "resourcepack", label: "Resource pack", description: "Textures, item models and model definitions for clients." },
  { id: "bundle", label: "Complete bundle", description: "Datapack + resource pack + sythix-runtime.json + manifest and validation report." },
];

async function manifestFor(c: ProjectContent, t: TargetVersion, format: ExportFormat, revision: number, files: FileMap) {
  const entries = [];
  for (const path of [...files.keys()].sort()) entries.push({ path, sha256: await sha256Hex(files.get(path)!), bytes: files.get(path)!.byteLength });
  return {
    generator: "SythiX ForgeOS",
    generatorVersion: RELEASE.version,
    project: { name: c.project.name, namespace: c.project.namespace, revision },
    format,
    target: { minecraft: t.id, datapackFormat: t.datapackFormat, resourcePackFormat: t.resourcePackFormat },
    requires: format === "bundle" && (c.abilities.length || c.sets.length) ? ["SythiX Runtime plugin (planned) for sythix-runtime.json"] : [],
    files: entries,
  };
}

/** Pure build step: content + texture bytes -> verified zip bytes. Exposed for tests. */
export async function buildExport(c: ProjectContent, format: ExportFormat, textures: Map<string, Uint8Array>, revision: number): Promise<{ zip: Uint8Array; report: ValidationReport; verifyErrors: string[] }> {
  const report = validateContent(c);
  const t = getTarget(c.project.target_version);
  if (!t) throw new AppError("validation_failed", "Unsupported target version.", report);
  const blocking = blocks(report, format);
  if (blocking.length) return { zip: new Uint8Array(), report, verifyErrors: blocking.map((b) => `${b.entity}: ${b.message}`) };

  const ns = c.project.namespace;
  const verifyErrors: string[] = [];
  let files: FileMap;
  if (format === "datapack") {
    files = generateDatapack(c, t);
    verifyErrors.push(...verifyPack("datapack", files, t, ns));
  } else if (format === "resourcepack") {
    files = generateResourcePack(c, t, textures);
    verifyErrors.push(...verifyPack("resourcepack", files, t, ns));
  } else {
    const dp = generateDatapack(c, t);
    const rp = generateResourcePack(c, t, textures);
    verifyErrors.push(...verifyPack("datapack", dp, t, ns), ...verifyPack("resourcepack", rp, t, ns));
    files = new Map();
    files.set(`datapacks/${ns}-datapack.zip`, deterministicZip(dp));
    files.set(`resourcepacks/${ns}-resourcepack.zip`, deterministicZip(rp));
    putJson(files, "sythix-runtime.json", generateRuntimeConfig(c));
  }
  putJson(files, "sythix-validation.json", report);
  const manifest = await manifestFor(c, t, format, revision, files);
  putJson(files, "sythix-manifest.json", manifest);
  return { zip: verifyErrors.length ? new Uint8Array() : deterministicZip(files), report, verifyErrors };
}

export async function loadTextures(ctx: AppContext, c: ProjectContent): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const a of c.assets.filter((x) => x.kind === "texture")) {
    const obj = await ctx.bucket.get(a.r2_key);
    if (obj) out.set(a.id, new Uint8Array(await obj.arrayBuffer()));
  }
  return out;
}

export interface ExportResult {
  id: string;
  status: "succeeded" | "failed";
  revision: number;
  sha256: string | null;
  size: number | null;
  report: ValidationReport;
  errors: string[];
}

/** Validates, generates, verifies and stores an export in R2; records an export job either way. */
export async function runExport(ctx: AppContext, user: SessionUser, projectId: string, format: ExportFormat): Promise<ExportResult> {
  const c = await loadProjectContent(ctx, projectId);
  if (!c) throw new AppError("not_found", "Project not found.");
  const revision = await ensureRevision(ctx, user, c, "Automatic revision for export");
  const textures = await loadTextures(ctx, c);
  const missing = c.assets.filter((a) => a.kind === "texture" && !textures.has(a.id));
  const { zip, report, verifyErrors } = await buildExport(c, format, textures, revision);
  const errors = [...verifyErrors, ...missing.map((m) => `Texture file for "${m.name}" is missing from storage.`)];
  const id = newId("exp");
  const status = errors.length ? "failed" : "succeeded";
  let sha: string | null = null;
  let key: string | null = null;
  if (status === "succeeded") {
    sha = await sha256Hex(zip);
    key = `exports/${c.project.workspace_id}/${c.project.id}/${id}.zip`;
    await ctx.bucket.put(key, zip, { httpMetadata: { contentType: "application/zip" }, customMetadata: { sha256: sha } });
  }
  await run(
    ctx.db,
    `INSERT INTO export_jobs (id, project_id, revision, format, target_version, status, r2_key, size_bytes, sha256, report, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, c.project.id, revision, format, c.project.target_version, status, key, status === "succeeded" ? zip.byteLength : null, sha,
    JSON.stringify({ ...report, exportErrors: errors }), user.id, ctx.now(),
  );
  await recordAudit(ctx, { actorId: user.id, action: `forge.export_${status}`, targetType: "project", targetId: c.project.id, workspaceId: c.project.workspace_id, metadata: { format, revision, exportId: id } });
  if (status === "succeeded") await awardAchievement(ctx, user.id, "first_export");
  else await notify(ctx, user.id, { kind: "export.failed", title: `Export of ${c.project.name} failed validation`, body: errors[0], link: `/forge/${c.project.id}/exports` });
  return { id, status, revision, sha256: sha, size: status === "succeeded" ? zip.byteLength : null, report, errors };
}

export async function getExportFile(ctx: AppContext, exportId: string, projectId: string): Promise<{ body: ReadableStream; filename: string; sha256: string } | null> {
  const job = await one<{ r2_key: string | null; format: string; revision: number; sha256: string; namespace: string }>(
    ctx.db,
    `SELECT e.r2_key, e.format, e.revision, e.sha256, p.namespace FROM export_jobs e JOIN projects p ON p.id = e.project_id WHERE e.id = ? AND e.project_id = ? AND e.status = 'succeeded'`,
    exportId,
    projectId,
  );
  if (!job?.r2_key) return null;
  const obj = await ctx.bucket.get(job.r2_key);
  if (!obj) return null;
  return { body: obj.body, filename: `${job.namespace}-${job.format}-r${job.revision}.zip`, sha256: job.sha256 };
}
