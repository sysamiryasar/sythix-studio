import semver from "semver";
import type { ModuleManifest } from "./types";

export interface RegistryIssue {
  moduleId: string;
  severity: "error" | "warning";
  message: string;
}

/**
 * Static validation of the module set: unique ids, valid versions, satisfiable
 * dependencies, no cycles, platform compatibility and no navigation collisions.
 * Runs in tests/CI and at runtime on the Modules page.
 */
export function validateRegistry(modules: readonly ModuleManifest[], platformVersion: string): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const byId = new Map<string, ModuleManifest>();
  const hrefs = new Map<string, string>();

  for (const m of modules) {
    if (byId.has(m.id)) issues.push({ moduleId: m.id, severity: "error", message: `Duplicate module id "${m.id}".` });
    byId.set(m.id, m);
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(m.id)) issues.push({ moduleId: m.id, severity: "error", message: "Module ids must be lowercase kebab-case." });
    if (!semver.valid(m.version)) issues.push({ moduleId: m.id, severity: "error", message: `Invalid version "${m.version}".` });
    if (!semver.validRange(m.platform)) issues.push({ moduleId: m.id, severity: "error", message: `Invalid platform range "${m.platform}".` });
    else if (!semver.satisfies(platformVersion, m.platform, { includePrerelease: true })) {
      issues.push({ moduleId: m.id, severity: "error", message: `Requires platform ${m.platform}; installed platform is ${platformVersion}.` });
    }
    for (const n of m.nav) {
      const owner = hrefs.get(n.href);
      if (owner && owner !== m.id) issues.push({ moduleId: m.id, severity: "error", message: `Navigation path ${n.href} is already used by ${owner}.` });
      hrefs.set(n.href, m.id);
    }
    for (const f of m.featureFlags) {
      if (!f.key.startsWith(`${m.id}.`)) issues.push({ moduleId: m.id, severity: "warning", message: `Feature flag "${f.key}" should be namespaced "${m.id}.*".` });
    }
  }

  for (const m of modules) {
    for (const [dep, range] of Object.entries(m.dependencies)) {
      const target = byId.get(dep);
      if (!target) issues.push({ moduleId: m.id, severity: "error", message: `Missing dependency "${dep}".` });
      else if (!semver.satisfies(target.version, range, { includePrerelease: true })) {
        issues.push({ moduleId: m.id, severity: "error", message: `Requires ${dep}@${range}, found ${target.version}.` });
      }
    }
  }

  // Cycle detection (DFS).
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      issues.push({ moduleId: id, severity: "error", message: `Dependency cycle: ${[...path, id].join(" -> ")}` });
      return;
    }
    state.set(id, "visiting");
    for (const dep of Object.keys(byId.get(id)?.dependencies ?? {})) if (byId.has(dep)) visit(dep, [...path, id]);
    state.set(id, "done");
  };
  for (const m of modules) visit(m.id, []);

  return issues;
}

/** Modules whose dependencies (transitively) include `id`. */
export function dependentsOf(modules: readonly ModuleManifest[], id: string): string[] {
  const out = new Set<string>();
  const walk = (target: string) => {
    for (const m of modules) {
      if (m.dependencies[target] !== undefined && !out.has(m.id)) {
        out.add(m.id);
        walk(m.id);
      }
    }
  };
  walk(id);
  return [...out];
}
