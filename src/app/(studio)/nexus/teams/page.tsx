import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listMyTeams } from "@/modules/nexusid/teams";
import { TeamsList } from "@/components/nexus/teams";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const { user, ctx } = await requireUser();
  return <TeamsList teams={await listMyTeams(ctx, user.id)} verified={user.emailVerified} />;
}
