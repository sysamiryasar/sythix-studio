import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listAchievements } from "@/modules/nexusid/achievements";
import { AchievementsBoard } from "@/components/nexus/achievements-board";

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsPage() {
  const { user, ctx } = await requireUser();
  return <AchievementsBoard items={await listAchievements(ctx, user.id)} />;
}
