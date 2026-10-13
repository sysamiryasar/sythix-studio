import semver from "semver";
import type { AppContext } from "@/lib/context";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { all, run } from "@/lib/db/sql";
import { recordAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { RELEASE } from "@/generated/release";
import { MODULES, getManifest } from "./index";
import { dependentsOf, validateRegistry, type RegistryIssue } from "./registry";
import type { HealthStatus, ModuleManifest } from "./types";

export interface ModuleState {
  manifest: ModuleManifest;
  installedVersion: string | null;
  enabledFlag: boolean;
  /** Effective availability: enabled, dependencies available, compatible, migrations applied. */
  available: boolean;
  reasons: string[];
  health: { status: HealthStatus; detail: string | null; checkedAt: number | null };
  pendingUpgrade: boolean;
}

interface RegistrationRow {
  module_id: string;
  installed_version: string;
  enabled: number;
  health_status: HealthStatus;
  health_detail: string | null;
  health_checked_at: number | null;
}

const statesCache = new WeakMap<AppContext, Promise<ModuleState[]>>();

async function appliedMigrations(ctx: AppContext): Promise<Set<string> | null> {
  try {
    const rows = await all<{ name: string }>(ctx.db, `SELECT name FROM d1_migrations`);
    return new Set(rows.map((r) => r.name));
  } catch {
    return null; // Migrations table unavailable (unusual); skip that check rather than fail closed.
  }
}

/**
 * Registers manifests that are new to this database and records version
 * upgrades. Called lazily; idempotent.
 */
export async function syncRegistrations(ctx: AppContext): Promise<void> {
  const existing = new Map((await all<RegistrationRow>(ctx.db, `SELECT * FROM module_registrations`)).map((r) => [r.module_id, r]));
  for (const m of MODULES) {
    const row = existing.get(m.id);
    if (!row) {
      await run(
        ctx.db,
        `INSERT OR IGNORE INTO module_registrations (module_id, installed_version, enabled, installed_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
        m.id,
        m.version,
        ctx.now(),
        ctx.now(),
      );
      await recordAudit(ctx, { actorType: "system", actorId: null, action: "module.installed", targetType: "module", targetId: m.id, metadata: { version: m.version } });
    } else if (row.installed_version !== m.version && semver.valid(row.installed_version) && semver.gt(m.version, row.installed_version)) {
      await run(ctx.db, `UPDATE module_registrations SET installed_version = ?, updated_at = ? WHERE module_id = ?`, m.version, ctx.now(), m.id);
      await recordAudit(ctx, {
        actorType: "system",
        actorId: null,
        action: "module.upgraded",
        targetType: "module",
        targetId: m.id,
        metadata: { from: row.installed_version, to: m.version },
      });
    }
  }
}

async function computeStates(ctx: AppContext): Promise<ModuleState[]> {
  let rows = await all<RegistrationRow>(ctx.db, `SELECT * FROM module_registrations`);
  if (rows.length < MODULES.length) {
    await syncRegistrations(ctx);
    rows = await all<RegistrationRow>(ctx.db, `SELECT * FROM module_registrations`);
  }
  const byId = new Map(rows.map((r) => [r.module_id, r]));
  const migrations = await appliedMigrations(ctx);
  const issues = validateRegistry(MODULES, RELEASE.version);

  const base = MODULES.map((m) => {
    const row = byId.get(m.id);
    const reasons: string[] = [];
    const enabledFlag = m.core ? true : (row?.enabled ?? 1) === 1;
    if (!enabledFlag) reasons.push("Disabled by a platform administrator.");
    for (const i of issues) if (i.moduleId === m.id && i.severity === "error") reasons.push(i.message);
    if (migrations) for (const file of m.migrations) if (!migrations.has(file)) reasons.push(`Migration ${file} has not been applied.`);
    return {
      manifest: m,
      installedVersion: row?.installed_version ?? null,
      enabledFlag,
      available: reasons.length === 0,
      reasons,
      health: { status: row?.health_status ?? "unknown", detail: row?.health_detail ?? null, checkedAt: row?.health_checked_at ?? null },
      pendingUpgrade: !!row && row.installed_version !== m.version,
    } satisfies ModuleState;
  });

  // Propagate unavailability through dependencies.
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of base) {
      if (!s.available) continue;
      for (const dep of Object.keys(s.manifest.dependencies)) {
        const d = base.find((x) => x.manifest.id === dep);
        if (!d || !d.available) {
          s.available = false;
          s.reasons.push(`Depends on ${dep}, which is unavailable.`);
          changed = true;
        }
      }
    }
  }
  return base;
}

export function getModuleStates(ctx: AppContext): Promise<ModuleState[]> {
  let p = statesCache.get(ctx);
  if (!p) {
    p = computeStates(ctx);
    statesCache.set(ctx, p);
  }
  return p;
}

export async function isModuleAvailable(ctx: AppContext, id: string): Promise<boolean> {
  return (await getModuleStates(ctx)).find((s) => s.manifest.id === id)?.available ?? false;
}

export async function assertModuleEnabled(ctx: AppContext, id: string): Promise<void> {
  const s = (await getModuleStates(ctx)).find((x) => x.manifest.id === id);
  if (!s) throw notFound("Module");
  if (!s.available) throw new AppError("module_disabled", `${s.manifest.name} is currently unavailable: ${s.reasons[0] ?? "unknown reason"}`);
}

export async function setModuleEnabled(ctx: AppContext, actorId: string, id: string, enabled: boolean): Promise<void> {
  const m = getManifest(id);
  if (!m) throw notFound("Module");
  if (m.core && !enabled) throw badRequest(`${m.name} is a core module and cannot be disabled.`);
  if (!enabled) {
    const states = await getModuleStates(ctx);
    const blocking = dependentsOf(MODULES, id).filter((d) => states.find((s) => s.manifest.id === d)?.enabledFlag);
    if (blocking.length) throw badRequest(`Disable dependent modules first: ${blocking.join(", ")}.`);
  } else {
    const states = await getModuleStates(ctx);
    const missing = Object.keys(m.dependencies).filter((d) => !states.find((s) => s.manifest.id === d)?.enabledFlag);
    if (missing.length) throw badRequest(`Enable required modules first: ${missing.join(", ")}.`);
  }
  await run(ctx.db, `UPDATE module_registrations SET enabled = ?, updated_at = ? WHERE module_id = ?`, enabled ? 1 : 0, ctx.now(), id);
  statesCache.delete(ctx);
  await recordAudit(ctx, { actorId, action: enabled ? "module.enabled" : "module.disabled", targetType: "module", targetId: id });
}

/** Runs every module's health check with isolation: one failure never affects the others. */
export async function runHealthChecks(ctx: AppContext): Promise<void> {
  await syncRegistrations(ctx);
  for (const m of MODULES) {
    let status: HealthStatus = "unknown";
    let detail = "No health check defined.";
    if (m.healthCheck) {
      try {
        const r = await Promise.race([
          m.healthCheck(ctx),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Health check timed out after 5s.")), 5000)),
        ]);
        status = r.status;
        detail = r.detail;
      } catch (err) {
        status = "unavailable";
        detail = (err as Error).message;
        log("warn", "module.health_failed", { module: m.id, err });
      }
    }
    await run(
      ctx.db,
      `UPDATE module_registrations SET health_status = ?, health_detail = ?, health_checked_at = ? WHERE module_id = ?`,
      status,
      detail,
      ctx.now(),
      m.id,
    );
  }
  statesCache.delete(ctx);
}

export function registryIssues(): RegistryIssue[] {
  return validateRegistry(MODULES, RELEASE.version);
}

// Feature flags ---------------------------------------------------------------

export interface FlagState {
  key: string;
  moduleId: string;
  description: string;
  defaultEnabled: boolean;
  globalOverride: boolean | null;
  enabled: boolean;
}

export async function listFlags(ctx: AppContext): Promise<FlagState[]> {
  const rows = await all<{ key: string; enabled: number }>(ctx.db, `SELECT key, enabled FROM feature_flags WHERE scope = 'global'`);
  const overrides = new Map(rows.map((r) => [r.key, r.enabled === 1]));
  return MODULES.flatMap((m) =>
    m.featureFlags.map((f) => {
      const o = overrides.get(f.key);
      return {
        key: f.key,
        moduleId: m.id,
        description: f.description,
        defaultEnabled: f.defaultEnabled,
        globalOverride: o ?? null,
        enabled: o ?? f.defaultEnabled,
      };
    }),
  );
}

export async function isFlagEnabled(ctx: AppContext, key: string, workspaceId?: string): Promise<boolean> {
  const def = MODULES.flatMap((m) => m.featureFlags).find((f) => f.key === key);
  if (!def) return false;
  const rows = await all<{ scope: string; enabled: number }>(
    ctx.db,
    `SELECT scope, enabled FROM feature_flags WHERE key = ? AND ((scope = 'global' AND scope_id = '') OR (scope = 'workspace' AND scope_id = ?))`,
    key,
    workspaceId ?? "",
  );
  const ws = rows.find((r) => r.scope === "workspace");
  if (ws) return ws.enabled === 1;
  const g = rows.find((r) => r.scope === "global");
  return g ? g.enabled === 1 : def.defaultEnabled;
}

export async function setFlag(ctx: AppContext, actorId: string, key: string, enabled: boolean | null): Promise<void> {
  if (!MODULES.some((m) => m.featureFlags.some((f) => f.key === key))) throw notFound("Feature flag");
  if (enabled === null) {
    await run(ctx.db, `DELETE FROM feature_flags WHERE key = ? AND scope = 'global'`, key);
  } else {
    await run(
      ctx.db,
      `INSERT INTO feature_flags (key, scope, scope_id, enabled, updated_by, updated_at) VALUES (?, 'global', '', ?, ?, ?)
       ON CONFLICT(key, scope, scope_id) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      key,
      enabled ? 1 : 0,
      actorId,
      ctx.now(),
    );
  }
  await recordAudit(ctx, { actorId, action: "flag.updated", targetType: "feature_flag", targetId: key, metadata: { enabled } });
}
