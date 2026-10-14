import { defineModule } from "../types";

export const forgeModule = defineModule({
  id: "forgeos",
  name: "ForgeOS",
  description: "Custom item, ability, equipment and texture authoring with version-aware datapack and resource-pack export.",
  version: "0.1.0",
  icon: "hammer",
  nav: [{ href: "/forge", label: "ForgeOS", icon: "hammer" }],
  permissions: ["project.view", "project.create", "project.edit", "project.delete", "project.export", "project.deploy.request"],
  dependencies: { studio: "^0.1.0" },
  platform: ">=0.1.0 <1.0.0",
  migrations: ["0004_forgeos.sql"],
  featureFlags: [{ key: "forgeos.server-deploy", description: "Deploy datapack exports to ServerOS servers.", defaultEnabled: true }],
  async healthCheck(ctx) {
    if (!ctx.bucket) return { status: "degraded", detail: "R2 bucket binding ASSETS_BUCKET is missing; uploads and exports are unavailable." };
    try {
      await ctx.bucket.head("__healthcheck__");
      return { status: "healthy", detail: "R2 asset storage reachable." };
    } catch (err) {
      return { status: "degraded", detail: `R2 asset storage error: ${(err as Error).message}` };
    }
  },
});
