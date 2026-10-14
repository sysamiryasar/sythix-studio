import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getProfile } from "@/modules/nexusid/profiles";
import { one, all } from "@/lib/db/sql";
import { ProfileEditor } from "@/components/nexus/profile-editor";

export const metadata: Metadata = { title: "NexusID profile" };

export default async function NexusProfilePage() {
  const { user, ctx } = await requireUser();
  const profile = await getProfile(ctx, user.id);
  const minecraft = await one<{ name: string; uuid: string }>(
    ctx.db,
    `SELECT provider_name AS name, provider_subject AS uuid FROM verified_identities WHERE user_id = ? AND provider = 'minecraft_java'`,
    user.id,
  );
  const loadout = await all<{ category: string; preview_style: string }>(
    ctx.db,
    `SELECT l.category, d.preview_style FROM cosmetic_loadout l JOIN cosmetic_definitions d ON d.id = l.cosmetic_id WHERE l.user_id = ?`,
    user.id,
  );
  return <ProfileEditor user={{ username: user.username, displayName: user.displayName }} initial={profile} minecraft={minecraft} loadout={loadout} />;
}
