import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { getTeam } from "@/modules/nexusid/teams";
import { TeamDetail } from "@/components/nexus/teams";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, ctx } = await requireUser();
  const data = await getTeam(ctx, user, slug);
  if (!data) notFound();
  return <TeamDetail data={data} currentUserId={user.id} />;
}
