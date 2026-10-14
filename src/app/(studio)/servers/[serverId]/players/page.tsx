import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { getPlayers } from "@/modules/serveros/reads";
import { serverCan } from "@/lib/authz/roles";
import { PlayersView } from "@/components/servers/players-view";

export default async function PlayersPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  const data = await getPlayers(ctx, user, serverId);
  return <PlayersView serverId={s.id} data={data} online={s.connection.state === "online"} canModerate={serverCan(s.role, "server.players.moderate") && s.connection.capabilities.includes("players")} environment={s.environment} simulated={s.connection.simulated} />;
}
