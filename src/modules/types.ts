import type { AppContext } from "@/lib/context";

export type ModuleId = string;

export type IconName =
  | "layout-dashboard" | "id-card" | "server" | "hammer" | "puzzle" | "refresh-cw" | "bell"
  | "settings" | "users" | "trophy" | "sparkles" | "shield" | "scroll-text" | "flag";

export interface ModuleNavItem {
  href: string;
  label: string;
  icon: IconName;
  children?: { href: string; label: string }[];
}

export interface ModuleFeatureFlag {
  key: string;
  description: string;
  defaultEnabled: boolean;
}

export type HealthStatus = "unknown" | "healthy" | "degraded" | "unavailable";

export interface ModuleHealth {
  status: HealthStatus;
  detail: string;
}

/**
 * A first-party SythiX module. Modules are compiled into the application and
 * registered explicitly in src/modules/index.ts after code review. Uploaded or
 * remote code is never loaded — see docs/MODULES.md for the extension model.
 */
export interface ModuleManifest {
  id: ModuleId;
  name: string;
  description: string;
  /** Semantic version of this module. */
  version: string;
  icon: IconName;
  /** Core modules cannot be disabled. */
  core?: boolean;
  nav: ModuleNavItem[];
  /** Permissions this module defines and checks. */
  permissions: string[];
  /** Other modules this one needs, with semver ranges. */
  dependencies: Record<ModuleId, string>;
  /** Supported SythiX platform version range. */
  platform: string;
  /** D1 migration files that must be applied for this module to work. */
  migrations: string[];
  featureFlags: ModuleFeatureFlag[];
  healthCheck?: (ctx: AppContext) => Promise<ModuleHealth>;
}

export function defineModule(m: ModuleManifest): ModuleManifest {
  return m;
}
