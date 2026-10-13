import { defineModule } from "../types";
import { one } from "@/lib/db/sql";

export const nexusModule = defineModule({
  id: "nexusid",
  name: "NexusID",
  description: "Player identity, profiles, cosmetics, achievements, friends and teams.",
  version: "0.1.0",
  icon: "id-card",
  nav: [
    {
      href: "/nexus",
      label: "NexusID",
      icon: "id-card",
      children: [
        { href: "/nexus", label: "Profile" },
        { href: "/nexus/cosmetics", label: "Cosmetics" },
        { href: "/nexus/achievements", label: "Achievements" },
        { href: "/nexus/friends", label: "Friends" },
        { href: "/nexus/teams", label: "Teams" },
      ],
    },
  ],
  permissions: [],
  dependencies: { studio: "^0.1.0" },
  platform: ">=0.1.0 <1.0.0",
  migrations: ["0002_nexusid.sql", "0005_oauth_states.sql"],
  featureFlags: [
    { key: "nexusid.minecraft-linking", description: "Minecraft Java account linking via Microsoft sign-in (requires MS_CLIENT_ID).", defaultEnabled: false },
  ],
  async healthCheck(ctx) {
    const r = await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM cosmetic_definitions`);
    if (!r?.n) return { status: "degraded", detail: "No cosmetic definitions are seeded." };
    return { status: "healthy", detail: `${r.n} cosmetic definitions available (placeholder assets).` };
  },
});
