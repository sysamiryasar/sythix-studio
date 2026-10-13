import { requireUser } from "@/lib/auth/current";
import { getServer, listServerMembers } from "@/modules/serveros/servers";
import { listCredentials } from "@/modules/serveros/credentials";
import { serverCan } from "@/lib/authz/roles";
import { AccessView } from "@/components/servers/access-view";

export default async function AccessPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  const canCreds = serverCan(s.role, "server.credentials.manage");
  return (
    <AccessView
      serverId={s.id}
      appUrl={ctx.env.APP_URL}
      members={await listServerMembers(ctx, user, serverId)}
      credentials={canCreds ? await listCredentials(ctx, user, serverId) : null}
      canManageMembers={serverCan(s.role, "server.members.manage")}
      currentUserId={user.id}
    />
  );
}
