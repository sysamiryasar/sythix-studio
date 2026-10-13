import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { getServer } from "@/modules/serveros/servers";
import { serverCan } from "@/lib/authz/roles";
import { ServerSettings } from "@/components/servers/server-settings";

export default async function ServerSettingsPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const { user, ctx } = await requireUser();
  const s = await getServer(ctx, user, serverId);
  if (!serverCan(s.role, "server.manage")) notFound();
  return <ServerSettings server={s} />;
}
