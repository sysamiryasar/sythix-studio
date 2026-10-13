// Explicit module registration. Adding a module = a reviewed code change here.
import type { ModuleManifest } from "./types";
import { studioModule } from "./studio/manifest";
import { nexusModule } from "./nexusid/manifest";
import { serverModule } from "./serveros/manifest";
import { forgeModule } from "./forgeos/manifest";

export const MODULES: readonly ModuleManifest[] = [studioModule, nexusModule, serverModule, forgeModule];

export function getManifest(id: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.id === id);
}
